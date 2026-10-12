/**
 * Toshkent vaqti (UTC+5, yozgi vaqt yo'q) — ilovadagi lib/subscription.js bilan bir xil qoida.
 */
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 5;

const pad = (n) => String(n).padStart(2, '0');

/** Toshkent bo'yicha hozirgi lahza qismlari */
function tashkentParts(now = new Date()) {
  const l = new Date(now.getTime() + TZ_OFFSET_MS);
  return {
    year: l.getUTCFullYear(),
    month: l.getUTCMonth() + 1,
    day: l.getUTCDate(),
    weekday: l.getUTCDay(),
    minutes: l.getUTCHours() * 60 + l.getUTCMinutes(),
  };
}

/** "YYYY-MM-DD" (Toshkent kuni) — ilovadagi Attendance.date formati */
function dateKey(now = new Date()) {
  const p = tashkentParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" -> daqiqa (0..1439). Noto'g'ri bo'lsa null */
function parseHHMM(s) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

const formatHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Oyning to'lov kuni: 31 berilgan bo'lsa-yu oy 30 kunlik bo'lsa — oxirgi kun */
function effectivePayDay(payDay, year, month) {
  return Math.min(payDay, daysInMonth(year, month));
}

/** "2026-10-12" -> "12.10.2026" */
const humanDate = (key) => key.split('-').reverse().join('.');

/** Ilovadagi subscriptionInfo bilan bir xil: 'paid' | 'grace' | 'blocked' */
function subscriptionState(user, now = new Date()) {
  const end = user.subscription_end_date ? new Date(user.subscription_end_date) : null;
  if (user.status === 'blocked') return 'blocked';
  if (end && now > new Date(end.getTime() + GRACE_DAYS * DAY_MS)) return 'blocked';
  if (end && now > end) return 'grace';
  return 'paid';
}

/** `now` turgan oydan monthsAhead oy keyingi oyning oxirgi lahzasi (Toshkent) — ilovadagi endOfMonth */
function endOfMonth(now = new Date(), monthsAhead = 0) {
  const local = new Date(now.getTime() + TZ_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + monthsAhead + 1, 1) - TZ_OFFSET_MS - 1);
}

module.exports = {
  TZ_OFFSET_MS,
  DAY_MS,
  tashkentParts,
  dateKey,
  parseHHMM,
  formatHHMM,
  daysInMonth,
  effectivePayDay,
  humanDate,
  subscriptionState,
  endOfMonth,
};
