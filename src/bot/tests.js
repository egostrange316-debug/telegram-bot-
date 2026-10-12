const { Test, Attempt } = require('../models/bot');

/**
 * Bo'limdagi testlar va har birining holati (o'quvchi uchun):
 *   'done'     — ishlangan va tahlil qilingan
 *   'analysis' — tahlil kutilmoqda (shu bo'limdagi KEYINGI testlar yopiq)
 *   'grading'  — Writing admin tekshiruvida (keyingi testlar yopiq)
 *   'open'     — ishlash mumkin
 *   'locked'   — oldingi test ishlanmagan yoki tahlil qilinmagan
 */
async function sectionState(userId, exam, section) {
  const tests = await Test.find({ exam, section, active: true }).sort({ order: 1 }).lean();
  const attempts = await Attempt.find({ user: userId, test: { $in: tests.map((t) => t._id) } })
    .select('test status createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const pending = attempts.find((a) => a.status !== 'done') || null;
  const doneIds = new Set(attempts.filter((a) => a.status === 'done').map((a) => String(a.test)));

  let unlocked = !pending;
  const rows = tests.map((t) => {
    const id = String(t._id);
    let state;
    if (pending && String(pending.test) === id) state = pending.status;
    else if (doneIds.has(id)) state = 'done';
    else state = unlocked ? 'open' : 'locked';
    if (state !== 'done') unlocked = false;
    return { test: t, state, pendingAttemptId: pending && String(pending.test) === id ? String(pending._id) : null };
  });
  return { rows, pending };
}

const STATE_ICON = { done: '✅', analysis: '🧠', grading: '⏳', open: '🔓', locked: '🔒' };

module.exports = { sectionState, STATE_ICON };
