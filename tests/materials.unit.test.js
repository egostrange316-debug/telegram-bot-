const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { User } = require('../src/models/app');
const { Test, TgLink, Attempt, ScreenshotResult, GroupChat } = require('../src/models/bot');
const { mainMenu, BTN, sessions, getSession } = require('../src/bot/common');
const { openMaterial } = require('../src/bot/materials');
const { processScreenshot } = require('../src/bot/screenshots');
const { sectionState } = require('../src/bot/tests');
const { allowedGroup } = require('../src/bot/registration');
const { rosterFilter, isMember, fullName } = require('../src/lib/enrollment');
const { validateExtraction } = require('../src/lib/screenshot-reader');

const chain = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
function setup(t) {
  const old = { STANDALONE: config.STANDALONE, GEMINI_API_KEY: config.GEMINI_API_KEY };
  config.STANDALONE = true; config.GEMINI_API_KEY = 'test-only-fake';
  t.after(() => { Object.assign(config, old); sessions.clear(); });
  sessions.clear();
  const user = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'student', full_name: 'Ali', group_ids: ['bbbbbbbbbbbbbbbbbbbbbbbb'] };
  const material = { _id: 'cccccccccccccccccccccccc', active: true, exam: 'ielts', section: 'reading', title: 'Cambridge 18 — Test 1',
    materials: [{ kind: 'document', file_id: 'html' }, { kind: 'audio', file_id: 'audio' }] };
  const next = { ...material, _id: 'dddddddddddddddddddddddd' };
  t.mock.method(TgLink, 'findOne', () => chain({ user: user._id }));
  t.mock.method(User, 'findById', () => chain(user));
  t.mock.method(Test, 'findOne', () => chain(material));
  t.mock.method(Test, 'find', () => chain([material, next]));
  t.mock.method(Attempt, 'findOne', () => chain(null));
  t.mock.method(Attempt, 'find', () => chain([]));
  t.mock.method(ScreenshotResult, 'findOne', () => chain(null));
  t.mock.method(ScreenshotResult, 'find', () => chain([]));
  let sequence = 1;
  const calls = [];
  const send = kind => async (...args) => { calls.push({ kind, args }); return { message_id: sequence++ }; };
  const ctx = { from: { id: 100 }, chat: { id: 100, type: 'private' }, message: {},
    reply: send('reply'), api: { sendDocument: send('document'), sendAudio: send('audio') } };
  return { user, material, next, ctx, calls };
}

test('Standalone menu starts with Materials and has no app login or separate screenshot picker', t => {
  setup(t);
  const labels = mainMenu({ student: true, admin: false }).keyboard.flat().map(b => b.text);
  assert.equal(labels[0], BTN.materials);
  assert.ok(!labels.includes(BTN.screenshot));
  const admin = mainMenu({ student: false, admin: true }).keyboard.flat().map(b => b.text);
  assert.ok(admin.includes(BTN.addMaterial));
});

test('Group enrollment rejects departed/restricted non-members and validates names', () => {
  assert.equal(isMember({ status: 'left' }), false);
  assert.equal(isMember({ status: 'kicked' }), false);
  assert.equal(isMember({ status: 'restricted', is_member: false }), false);
  assert.equal(isMember({ status: 'restricted', is_member: true }), true);
  assert.equal(isMember({ status: 'member' }), true);
  assert.equal(fullName('  Ali   Valiyev  '), 'Ali Valiyev');
  assert.equal(fullName('/start'), null);
  assert.equal(fullName('12345'), null);
  assert.equal(fullName('a'.repeat(81)), null);
});

test('Standalone attendance isolates different Telegram groups with the same name', t => {
  setup(t);
  assert.deepEqual(rosterFilter({ _id: 'a', group_name: 'IELTS' }), { role: 'student', group_ids: 'a' });
  assert.deepEqual(rosterFilter({ _id: 'b', group_name: 'IELTS' }), { role: 'student', group_ids: 'b' });
});

test('Membership lookup failures never enroll a student', async t => {
  const { ctx } = setup(t);
  t.mock.method(GroupChat, 'findOne', () => chain({ _id: 'g', chat_id: -1 }));
  ctx.api.getChatMember = async () => ({ status: 'left' });
  assert.equal(await allowedGroup(ctx, 'g'), null);
  ctx.api.getChatMember = async () => { throw Error('no access'); };
  assert.equal(await allowedGroup(ctx, 'g'), null);
});

test('Selecting material sends files in order and remembers the exact test before requesting screenshot', async t => {
  const { material, ctx, calls } = setup(t);
  await openMaterial(ctx, material._id);
  assert.deepEqual(calls.map(c => c.kind), ['reply', 'document', 'audio', 'reply']);
  assert.match(calls.at(-1).args[0], /Testni ishlab bo‘lgach, natija skrinshotini shu chatga yuboring/);
  const session = getSession(100);
  assert.equal(session.testId, material._id);
  assert.equal(session.step, 'screenshot_image');
  assert.deepEqual(session.contextMessageIds, [2, 3, 4]);
});

test('Failure while delivering an audio does not enable screenshot submission', async t => {
  const { material, ctx } = setup(t);
  ctx.api.sendAudio = async () => { throw Error('offline'); };
  await assert.rejects(openMaterial(ctx, material._id));
  assert.equal(getSession(100), null);
});

test('Screenshot inherits material ID/title even when AI returns a different generic title', async t => {
  const { material, ctx } = setup(t);
  await openMaterial(ctx, material._id);
  const session = getSession(100), created = [], updates = [];
  t.mock.method(ScreenshotResult, 'aggregate', async () => []);
  t.mock.method(ScreenshotResult, 'create', async doc => { created.push(doc); return { ...doc, _id: 'eeeeeeeeeeeeeeeeeeeeeeee' }; });
  t.mock.method(ScreenshotResult, 'updateOne', async (filter, update) => { updates.push(update); return { modifiedCount: 1 }; });
  await processScreenshot(ctx, session, { file_id: 'screenshot', file_unique_id: 'unique' }, {
    downloadScreenshot: async () => ({ bytes: Buffer.from('image'), mime: 'image/png' }),
    readScreenshot: async (_, expected) => {
      assert.equal(expected.title, material.title);
      return { title: 'Generic result heading', score: 30, maximum: 40, score_type: 'correct', percent: 75 };
    },
  });
  assert.equal(created[0].test, material._id);
  assert.equal(updates.at(-1).$set.title, material.title);
  assert.equal(getSession(100).testId, material._id);
  assert.equal(getSession(100).step, 'screenshot_confirm');
});

test('An image already assigned to another material cannot be reassigned', async t => {
  const { material, ctx, calls } = setup(t);
  await openMaterial(ctx, material._id);
  t.mock.method(ScreenshotResult, 'findOne', filter => chain(filter.file_unique_id ? { test: 'other', status: 'draft' } : null));
  await processScreenshot(ctx, getSession(100), { file_id: 'a', file_unique_id: 'a' }, {
    downloadScreenshot: () => assert.fail('must not download'), readScreenshot: () => assert.fail('must not call AI'),
  });
  assert.match(calls.at(-1).args[0], /boshqa material/);
});

test('Replying to an old material prompt does not silently attach to the new test', async t => {
  const { material, ctx, calls } = setup(t);
  await openMaterial(ctx, material._id);
  ctx.message.reply_to_message = { message_id: 999, from: { is_bot: true } };
  await processScreenshot(ctx, getSession(100), { file_id: 'a', file_unique_id: 'a' });
  assert.match(calls.at(-1).args[0], /boshqa xabarga/);
});

test('Accepted material remains locked until analysis is completed', async t => {
  const { user, material } = setup(t);
  let pending = true;
  t.mock.method(ScreenshotResult, 'findOne', filter => chain(filter.needs_analysis && pending
    ? { _id: 'e', test: material._id, needs_analysis: true } : null));
  t.mock.method(ScreenshotResult, 'find', () => chain(pending ? [] : [{ test: material._id }]));
  let state = await sectionState(user._id, 'ielts', 'reading');
  assert.equal(state.rows[0].state, 'analysis');
  assert.equal(state.rows[1].state, 'locked');
  pending = false;
  state = await sectionState(user._id, 'ielts', 'reading');
  assert.equal(state.rows[0].state, 'done');
  assert.equal(state.rows[1].state, 'open');
});

test('A clearly different visible material is rejected without guessing test identity', () => {
  const raw = { is_result: true, readability: 'clear', material_match: false, score: 30, maximum: 40, score_type: 'correct' };
  assert.throws(() => validateExtraction(raw, { exam: 'ielts', section: 'reading', title: 'Test 1' }), e => e.code === 'mismatch');
});
