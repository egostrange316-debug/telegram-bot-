const mongoose = require('mongoose');
const { Attempt, ScreenshotResult } = require('../models/bot');
const { scoreLabel } = require('./screenshot-reader');
const { User } = require('../models/app');

const SECTION_NAMES = { reading: 'Reading', listening: 'Listening', writing: 'Writing' };
const EXAM_NAMES = { ielts: 'IELTS', cefr: 'CEFR' };

const round1 = (n) => Math.round(n * 10) / 10;
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/**
 * O'sish/pasayish: oxirgi 3 natija o'rtachasi oldingi 3 tasi bilan solishtiriladi.
 * 'up' | 'down' | 'flat' | null (natija yetarli emas)
 */
function trend(values, threshold = 2) {
  if (values.length < 2) return { direction: null, diff: 0 };
  const k = Math.min(3, Math.floor(values.length / 2));
  const last = avg(values.slice(-k));
  const prev = avg(values.slice(-2 * k, -k));
  const diff = round1(last - prev);
  return { direction: diff > threshold ? 'up' : diff < -threshold ? 'down' : 'flat', diff };
}

const TREND_TEXT = { up: "📈 O'syapsiz", down: '📉 Pasayyapsiz', flat: '➡️ Barqaror' };

/** O'quvchining bitta imtihon (IELTS/CEFR) bo'yicha baholangan natijalari, vaqt bo'yicha */
async function userResults(userId, exam) {
  const rows = await Attempt.find({ user: userId, exam, status: { $ne: 'grading' }, percent: { $ne: null } })
    .sort({ createdAt: 1 })
    .populate('test', 'title')
    .lean();
  const items = rows.map((r) => ({
    id: String(r._id),
    date: r.createdAt,
    title: r.test ? r.test.title : "(o'chirilgan test)",
    section: r.section,
    percent: r.percent,
    band: r.band ?? null,
    level: r.level ?? null,
    correct: r.correct ?? null,
    total: r.total ?? null,
    score: r.score ?? null,
    max_score: r.max_score ?? null,
    status: r.status,
  }));
  const bySection = {};
  for (const s of Object.keys(SECTION_NAMES)) {
    const own = items.filter((i) => i.section === s);
    bySection[s] = {
      count: own.length,
      average_percent: own.length ? round1(avg(own.map((i) => i.percent))) : null,
      average_band: exam === 'ielts' && own.length ? Math.round(avg(own.map((i) => i.band ?? 0)) * 2) / 2 : null,
      trend: trend(own.map((i) => i.percent)),
    };
  }
  const screenshots = await ScreenshotResult.find({ user: userId, exam, status: 'accepted' })
    .select('exam section title score_type score maximum percent accepted_at').sort({ accepted_at: -1, _id: -1 }).limit(200).lean();
  return {
    exam,
    items,
    screenshots: screenshots.reverse().map(r => ({
      id: String(r._id), date: r.accepted_at, title: r.title, section: r.section,
      score: r.score, maximum: r.maximum, score_type: r.score_type, score_label: scoreLabel(r), percent: r.percent,
      source: 'screenshot', verified: false,
    })),
    average_percent: items.length ? round1(avg(items.map((i) => i.percent))) : null,
    trend: trend(items.map((i) => i.percent)),
    sections: bySection,
  };
}

/** Butun o'quv markaz reytingi: o'rtacha foiz bo'yicha (kamida 1 ta baholangan test) */
async function leaderboard(exam, limit = 100) {
  const agg = await Attempt.aggregate([
    { $match: { exam, status: { $ne: 'grading' }, percent: { $ne: null } } },
    // First graded attempt per test counts towards ranking; retakes remain on the personal chart.
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: { user: '$user', test: '$test' }, first: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$first' } },
    { $group: { _id: '$user', avg: { $avg: '$percent' }, band: { $avg: '$band' }, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
    { $sort: { avg: -1, count: -1, last: 1 } },
  ]);
  const users = await User.find({ _id: { $in: agg.map((a) => a._id) }, role: 'student' })
    .select('full_name group_name')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return agg
    .filter((a) => byId.has(String(a._id)))
    .slice(0, limit)
    .map((a, i) => ({
      place: i + 1,
      user_id: String(a._id),
      full_name: byId.get(String(a._id)).full_name,
      group_name: byId.get(String(a._id)).group_name || null,
      average_percent: round1(a.avg),
      average_band: exam === 'ielts' && a.band != null ? Math.round(a.band * 2) / 2 : null,
      tests: a.count,
    }));
}

/** Chart.js konfiguratsiyasi (QuickChart orqali PNG ga aylantiriladi) */
function chartConfig(result) {
  const colors = { reading: '#2a78d6', listening: '#e07b39', writing: '#3a9d5d' };
  const labels = result.items.map((_, i) => String(i + 1));
  const datasets = Object.keys(SECTION_NAMES)
    .filter((s) => result.sections[s].count)
    .map((s) => ({
      label: SECTION_NAMES[s],
      data: result.items.map((it) => (it.section === s ? it.percent : null)),
      borderColor: colors[s],
      backgroundColor: colors[s],
      spanGaps: true,
      fill: false,
      tension: 0.25,
    }));
  return {
    type: 'line',
    data: { labels, datasets },
    options: {
      plugins: { title: { display: true, text: `${EXAM_NAMES[result.exam]} natijalari (%)` } },
      scales: { y: { min: 0, max: 100 }, x: { title: { display: true, text: 'Test #' } } },
    },
  };
}

const isId = (s) => mongoose.isValidObjectId(s);

module.exports = { SECTION_NAMES, EXAM_NAMES, TREND_TEXT, trend, userResults, leaderboard, chartConfig, isId };
