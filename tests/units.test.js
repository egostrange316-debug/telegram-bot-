const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { parseAnswers, parseKey, grade, ieltsBand, cefrLevel, parseWritingScore } = require('../src/lib/grading');
const { dateKey, parseHHMM, effectivePayDay, subscriptionState, endOfMonth, tashkentParts } = require('../src/lib/time');
const { trend } = require('../src/lib/stats');
const { verifyInitData } = require('../src/api/server');

test('javoblar: raqamlangan bir qatorda', () => {
  assert.deepStrictEqual(parseAnswers('1-A 2-B 3-not given 4) true'), ['A', 'B', 'not given', 'true']);
});

test('javoblar: har qatorda bittadan va vergul bilan', () => {
  assert.deepStrictEqual(parseAnswers('A\nB\nC'), ['A', 'B', 'C']);
  assert.deepStrictEqual(parseAnswers('1.A, 2.B, 3.C'), ['A', 'B', 'C']);
});

test("javoblar: tushib qolgan savol bo'sh qoladi", () => {
  assert.deepStrictEqual(parseAnswers('1-A 3-C'), ['A', '', 'C']);
});

test('kalit: muqobil variantlar', () => {
  assert.deepStrictEqual(parseKey('1-colour/color 2-B'), [['colour', 'color'], ['B']]);
});

test('baholash: katta-kichik harf, qisqartmalar, muqobillar', () => {
  const key = parseKey('1-A 2-TRUE 3-not given 4-colour/color 5-B');
  const r = grade(key, parseAnswers('1-a 2-t 3-NG 4-Color. 5-C'));
  assert.strictEqual(r.correct, 4);
  assert.strictEqual(r.total, 5);
  assert.strictEqual(r.percent, 80);
  assert.deepStrictEqual(r.mistakes, [{ q: 5, given: 'C', correct: 'B' }]);
});

test('IELTS band: 40 savol va mutanosib', () => {
  assert.strictEqual(ieltsBand('listening', 30, 40), 7);
  assert.strictEqual(ieltsBand('reading', 30, 40), 7);
  assert.strictEqual(ieltsBand('reading', 40, 40), 9);
  assert.strictEqual(ieltsBand('listening', 10, 13), 7); // 10/13*40 = 30.8 -> 31
  assert.strictEqual(ieltsBand('reading', 0, 40), 0);
});

test('CEFR daraja', () => {
  assert.strictEqual(cefrLevel(90), 'C1');
  assert.strictEqual(cefrLevel(70), 'B2');
  assert.strictEqual(cefrLevel(55), 'B1');
  assert.strictEqual(cefrLevel(10), 'A1');
});

test('Writing bahosi', () => {
  assert.deepStrictEqual(parseWritingScore('ielts', '6.5'), { score: 6.5, max_score: 9, percent: 72.2 });
  assert.strictEqual(parseWritingScore('ielts', '6.3'), null);
  assert.strictEqual(parseWritingScore('ielts', '10'), null);
  assert.deepStrictEqual(parseWritingScore('cefr', '60/75'), { score: 60, max_score: 75, percent: 80 });
  assert.deepStrictEqual(parseWritingScore('cefr', '45', 75), { score: 45, max_score: 75, percent: 60 });
  assert.strictEqual(parseWritingScore('cefr', 'abc'), null);
});

test('Toshkent vaqti', () => {
  const d = new Date('2026-10-11T20:30:00Z'); // Toshkentda 12-oktabr 01:30
  assert.strictEqual(dateKey(d), '2026-10-12');
  const p = tashkentParts(d);
  assert.strictEqual(p.minutes, 90);
  assert.strictEqual(p.weekday, 1); // dushanba
  assert.strictEqual(parseHHMM('14:00'), 840);
  assert.strictEqual(parseHHMM('24:00'), null);
  assert.strictEqual(effectivePayDay(31, 2026, 2), 28);
  assert.strictEqual(effectivePayDay(5, 2026, 2), 5);
});

test("obuna holati ilovadagi qoida bilan bir xil", () => {
  const now = new Date('2026-10-12T05:00:00Z');
  assert.strictEqual(subscriptionState({ status: 'active', subscription_end_date: endOfMonth(now) }, now), 'paid');
  assert.strictEqual(subscriptionState({ status: 'active', subscription_end_date: new Date('2026-10-10T00:00:00Z') }, now), 'grace');
  assert.strictEqual(subscriptionState({ status: 'active', subscription_end_date: new Date('2026-09-30T18:59:59Z') }, now), 'blocked');
  assert.strictEqual(subscriptionState({ status: 'blocked', subscription_end_date: endOfMonth(now) }, now), 'blocked');
  assert.strictEqual(endOfMonth(now).toISOString(), '2026-10-31T18:59:59.999Z');
});

test("o'sish yo'nalishi", () => {
  assert.strictEqual(trend([50]).direction, null);
  assert.strictEqual(trend([50, 60, 55, 70, 75, 80]).direction, 'up');
  assert.strictEqual(trend([80, 75, 70, 60, 55, 50]).direction, 'down');
  assert.strictEqual(trend([60, 61, 60, 61]).direction, 'flat');
});

test('Mini App initData imzosi', () => {
  const token = '123:ABC';
  const user = JSON.stringify({ id: 42, first_name: 'Ali' });
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'q', user });
  const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  assert.strictEqual(verifyInitData(params.toString(), token).id, 42);
  assert.strictEqual(verifyInitData(params.toString(), '999:WRONG'), null);
  params.set('user', JSON.stringify({ id: 1 }));
  assert.strictEqual(verifyInitData(params.toString(), token), null);
});
