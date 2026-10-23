const { randomUUID } = require('crypto');
const { JobLog } = require('../models/bot');

// Successful deliveries survive restarts. Failed sends are retryable. A lease
// lets a crashed worker recover; Telegram itself offers no exactly-once send API.
async function deliverOnce(key, send, now = new Date()) {
  const owner = randomUUID();
  const lease_until = new Date(now.getTime() + 5 * 60_000);
  try {
    await JobLog.create({ key, state: 'running', owner, lease_until });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const acquired = await JobLog.findOneAndUpdate({ key, $or: [
      { state: 'failed' }, { state: 'running', lease_until: { $lte: now } },
    ] }, { $set: { state: 'running', owner, lease_until } }, { new: true }).lean();
    // Legacy records without state represent previously delivered messages.
    if (!acquired) return false;
  }
  try {
    await send();
    await JobLog.updateOne({ key, owner }, { $set: { state: 'done', completed_at: new Date() }, $unset: { lease_until: 1 } });
    return true;
  } catch (error) {
    await JobLog.updateOne({ key, owner }, { $set: { state: 'failed' }, $unset: { lease_until: 1 } });
    throw error;
  }
}

// Split only at line boundaries so HTML entities and tags remain intact.
function messageChunks(text, limit = 3800) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (line.length > limit) throw new Error('Hisobot satri juda uzun');
    if (current.length + line.length + 1 > limit) { chunks.push(current); current = ''; }
    current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendReport(api, chatId, text, key) {
  for (const [index, part] of messageChunks(text).entries()) {
    const send = () => api.sendMessage(chatId, part, { parse_mode: 'HTML' });
    if (key) {
      const partKey = `${key}:part:${index}`;
      if (!(await deliverOnce(partKey, send))) {
        const delivery = await JobLog.findOne({ key: partKey }).lean();
        // Another worker may still be sending this part. Only completed (or
        // legacy completed) records allow the report's data to be released.
        if (!delivery || (delivery.state && delivery.state !== 'done')) return false;
      }
    } else await send();
  }
  return true;
}

module.exports = { deliverOnce, messageChunks, sendReport };
