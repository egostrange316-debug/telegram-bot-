/**
 * Javoblarni o'qish va baholash (Reading/Listening).
 *
 * Qabul qilinadigan formatlar (javob kaliti uchun ham, o'quvchi javobi uchun ham):
 *   1-A 2-B 3-C            1) A, 2) B          har qatorda bittadan:  A
 *   1. true                1: not given                                B
 * Javob kalitida muqobil variantlar "/" bilan: `5-colour/color`.
 */

const SEP = /[\n,;]+/;
const NUMBERED = /(?:^|\s)(\d{1,3})\s*[-.):=]\s*/g;

/** Matn -> javoblar massivi (indeks 0 = 1-savol). Raqamlanmagan bo'laklar ketma-ket joylanadi. */
function parseAnswers(text) {
  const out = [];
  let next = 0;
  for (const piece of String(text || '').split(SEP)) {
    const s = piece.trim();
    if (!s) continue;
    const marks = [...s.matchAll(NUMBERED)];
    if (!marks.length || marks[0].index !== 0) {
      out[next++] = s;
      continue;
    }
    marks.forEach((m, i) => {
      const start = m.index + m[0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index : s.length;
      const n = Number(m[1]);
      const val = s.slice(start, end).trim();
      if (n >= 1 && n <= 200 && val) {
        out[n - 1] = val;
        next = n;
      }
    });
  }
  return Array.from(out, (v) => (v === undefined ? '' : v));
}

const SYNONYMS = { t: 'true', f: 'false', ng: 'not given', y: 'yes', n: 'no' };

/** Taqqoslash uchun: kichik harf, ortiqcha bo'shliq/tinish belgilarisiz, qisqartmalar ochilgan */
function normalize(s) {
  const v = String(s || '')
    .toLowerCase()
    .replace(/[“”"'`’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,!?]+|[\s.,!?]+$/g, '');
  return SYNONYMS[v] || v;
}

/** Javob kaliti matni -> [[variantlar], ...] */
function parseKey(text) {
  return parseAnswers(text).map((v) => v.split('/').map((x) => x.trim()).filter(Boolean));
}

function grade(key, given) {
  const mistakes = [];
  let correct = 0;
  key.forEach((variants, i) => {
    const g = given[i] || '';
    if (g && variants.some((v) => normalize(v) === normalize(g))) correct += 1;
    else mistakes.push({ q: i + 1, given: g, correct: variants.join(' / ') });
  });
  const total = key.length;
  return { correct, total, percent: total ? Math.round((correct / total) * 1000) / 10 : 0, mistakes };
}

// IELTS xom ball (40 dan) -> band. [eng kam to'g'ri javob, band]
const LISTENING_BANDS = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1]];
const READING_BANDS = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1]];

/** 40 savollik bo'lmasa, ball 40 ga mutanosib hisoblanadi (taxminiy) */
function ieltsBand(section, correct, total) {
  if (!total) return 0;
  const raw = Math.round((correct / total) * 40);
  const table = section === 'listening' ? LISTENING_BANDS : READING_BANDS;
  const row = table.find(([min]) => raw >= min);
  return row ? row[1] : 0;
}

/** Foizdan taxminiy CEFR darajasi (Multilevel: B1 38+, B2 51+, C1 65+ / 75) */
function cefrLevel(percent) {
  if (percent >= 86.5) return 'C1';
  if (percent >= 68) return 'B2';
  if (percent >= 50.5) return 'B1';
  if (percent >= 35) return 'A2';
  return 'A1';
}

/** Writing balli: "6.5", "52/75", "52". IELTS — 0..9, 0.5 qadam. Noto'g'ri bo'lsa null */
function parseWritingScore(exam, text, defaultMax) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?\s*$/.exec(String(text || ''));
  if (!m) return null;
  const score = Number(m[1].replace(',', '.'));
  const max = exam === 'ielts' ? 9 : Number((m[2] || String(defaultMax || 75)).replace(',', '.'));
  if (!(max > 0) || score < 0 || score > max) return null;
  if (exam === 'ielts' && (score * 2) % 1 !== 0) return null;
  return { score, max_score: max, percent: Math.round((score / max) * 1000) / 10 };
}

module.exports = { parseAnswers, parseKey, normalize, grade, ieltsBand, cefrLevel, parseWritingScore };
