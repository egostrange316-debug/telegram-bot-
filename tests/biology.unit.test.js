const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAnswers, grade, parseLocal, latestSlot, weekStart, rank, isMember } = require('../src/biology/domain');
const { validateSheet } = require('../src/biology/answer-reader');
test('biology accepts numbered and compact four-choice answers, with explicit blanks', () => {
  assert.deepEqual(parseAnswers('1a 2B 3.c 4-D 5-', 5), ['A', 'B', 'C', 'D', '-']);
  assert.deepEqual(parseAnswers('ABCD', 4, true), ['A', 'B', 'C', 'D']);
  assert.deepEqual(parseAnswers('1a2b3c4d', 4), ['A', 'B', 'C', 'D']);
});
test('biology rejects duplicate numbers, omitted answers, garbage and invalid answer keys', () => {
  for (const input of ['1A 1B 3C 4D', '1A 3C 4D', '1A 2B 3C 5D', '1A 2B 3C 4E', 'xxx 1A 2B 3C 4D']) assert.throws(() => parseAnswers(input, 4));
  assert.throws(() => parseAnswers('ABC-', 4, true));
});
test('biology grading comes only from the configured key', () => {
  assert.deepEqual(grade(['B','B','-','D'], ['A','B','C','D']), { correct: 2, total: 4, blank: 1, percent: 50, mistakes: [1,3] });
});
test('OCR rejects uncertain and duplicate question numbers', () => {
  assert.throws(() => validateSheet({readability:'uncertain',answers:[]}, 2));
  assert.throws(() => validateSheet({readability:'clear',answers:[{number:1,choice:'A'},{number:1,choice:'B'}]}, 2));
  assert.deepEqual(validateSheet({readability:'clear',answers:[{number:2,choice:'D'},{number:1,choice:'A'}]}, 2), ['A','D']);
});
test('Tashkent weekly slot and Monday boundary are deterministic', () => {
  const now = new Date('2026-11-15T15:01:00Z');
  assert.equal(latestSlot({weekday:0,time:'20:00'}, now).toISOString(), '2026-11-15T15:00:00.000Z');
  assert.equal(weekStart(now).toISOString(), '2026-11-08T19:00:00.000Z');
  assert.equal(parseLocal('2026-11-15 20:00').toISOString(), '2026-11-15T15:00:00.000Z');
  assert.throws(() => parseLocal('2026-02-30 20:00'));
});
test('equal scores share rank and departed members cannot enroll', () => {
  assert.deepEqual(rank([{name:'C',correct:4},{name:'B',correct:5},{name:'A',correct:5}]).map(r => r.place), [1,1,3]);
  assert.equal(isMember({status:'restricted',is_member:false}),false);
  assert.equal(isMember({status:'restricted',is_member:true}),true);
  assert.equal(isMember({status:'left'}),false);
});
