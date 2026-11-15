class InputError extends Error {}
const OFFSET = 5 * 3600_000;
const DAY = 86400_000;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function parseAnswers(text, count, key = false) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new InputError('Savollar soni noto‘g‘ri.');
  const s = String(text || '').trim().toUpperCase();
  const allowed = key ? /^[ABCD]$/ : /^[ABCD-]$/;
  let answers;
  if (/\d/.test(s)) {
    answers = Array(count).fill(null);
    const pattern = /(\d{1,3})\s*[).:=\-]?\s*([ABCD-])(?=\s|[,;]|\d|$)/g;
    let m; let end = 0;
    while ((m = pattern.exec(s))) {
      if (!/^[\s,;]*$/.test(s.slice(end, m.index))) throw new InputError('Javob formati: 1A 2B 3C …');
      const n = Number(m[1]);
      if (n < 1 || n > count || answers[n - 1] !== null) throw new InputError('Savol raqami takrorlangan yoki chegaradan tashqarida.');
      answers[n - 1] = m[2]; end = pattern.lastIndex;
    }
    if (!/^[\s,;]*$/.test(s.slice(end))) throw new InputError('Javob formati: 1A 2B 3C …');
  } else answers = s.replace(/[\s,;]+/g, '').split('');
  if (answers.length !== count || answers.some(x => !allowed.test(x || ''))) {
    throw new InputError(`Aynan ${count} ta javob kerak: A, B, C yoki D.${key ? '' : ' Bo‘sh javob uchun - yozing.'}`);
  }
  return answers;
}
const answerText = answers => answers.map((a, i) => `${i + 1}${a}`).join(' ');
function grade(answers, key) {
  const mistakes = [];
  answers.forEach((a, i) => { if (a !== key[i]) mistakes.push(i + 1); });
  return { correct: key.length - mistakes.length, total: key.length, blank: answers.filter(a => a === '-').length,
    percent: Math.round(1000 * (key.length - mistakes.length) / key.length) / 10, mistakes };
}
function localTime(date) { return new Date(new Date(date).getTime() + OFFSET).toISOString().slice(0, 16).replace('T', ' '); }
function parseLocal(text) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) throw new InputError('Vaqt formati: 2026-11-22 20:00');
  const d = new Date(text.replace(' ', 'T') + ':00+05:00');
  if (!Number.isFinite(d.getTime()) || localTime(d) !== text) throw new InputError('Sana yoki vaqt noto‘g‘ri.');
  return d;
}
function latestSlot(group, now = new Date()) {
  const local = new Date(now.getTime() + OFFSET);
  const [h, m] = group.time.split(':').map(Number);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET;
  let slot = midnight - ((local.getUTCDay() - group.weekday + 7) % 7) * DAY + (h * 60 + m) * 60_000;
  if (slot > now.getTime()) slot -= 7 * DAY;
  return new Date(slot);
}
function weekStart(now = new Date()) {
  const p = new Date(now.getTime() + OFFSET);
  return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()) - OFFSET - ((p.getUTCDay() + 6) % 7) * DAY);
}
function rank(rows) {
  const sorted = [...rows].sort((a, b) => b.correct - a.correct || String(a.name).localeCompare(String(b.name)));
  let place = 0;
  return sorted.map((r, i) => { if (!i || r.correct !== sorted[i - 1].correct) place = i + 1; return { ...r, place }; });
}
const isMember = m => ['creator', 'administrator', 'member'].includes(m?.status) || m?.status === 'restricted' && m.is_member === true;
module.exports = { InputError, esc, parseAnswers, answerText, grade, localTime, parseLocal, latestSlot, weekStart, rank, isMember, DAY };
