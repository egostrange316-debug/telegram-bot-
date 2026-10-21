const crypto = require('crypto');
const { TgLink, LinkCode } = require('../models/bot');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function issueLinkCode(userId) {
  const code = crypto.randomBytes(24).toString('base64url');
  await LinkCode.findOneAndUpdate({ user: userId }, { $set: {
    hash: hash(code), expires_at: new Date(Date.now() + 5 * 60_000),
  } }, { upsert: true });
  return code;
}

async function linkAccount(telegramId, userId, username) {
  await TgLink.deleteOne({ telegram_id: telegramId, user: { $ne: userId } });
  return TgLink.findOneAndUpdate({ user: userId }, { $set: {
    telegram_id: telegramId, username,
  } }, { upsert: true, new: true });
}

async function consumeLinkCode(code) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) return null;
  return LinkCode.findOneAndDelete({ hash: hash(code), expires_at: { $gt: new Date() } }).lean();
}

module.exports = { issueLinkCode, consumeLinkCode, linkAccount };
