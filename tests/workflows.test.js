const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { User, Attendance } = require('../src/models/app');
const { TgLink, Test, Attempt, GroupChat, JobLog, BotSession, LinkCode, ScreenshotResult } = require('../src/models/bot');
const { createBot } = require('../src/bot');
const { createServer } = require('../src/api/server');
const { sectionState } = require('../src/bot/tests');
const attendance = require('../src/bot/attendance');
const payments = require('../src/bot/payments');
const { deliverOnce } = require('../src/lib/delivery');
const { userResults, leaderboard } = require('../src/lib/stats');
const { issueLinkCode } = require('../src/lib/linking');
const { tick } = require('../src/scheduler');
const { sessions } = require('../src/bot/common');
const { ScreenshotError } = require('../src/lib/screenshot-reader');
let mongo, server, base, sequence = 1;

before(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri();
  }
  await mongoose.connect(uri, { dbName: 'enzo_bot_test' });
  for (const model of Object.values(mongoose.models)) await model.init();
  config.BOT_TOKEN = '123456789:TEST_ONLY';
  config.BOT_USERNAME = 'enzo_test_bot';
  config.JWT_SECRET = 'test-only-secret-without-real-credentials';
  config.ADMIN_IDS = [900];
  config.CORS_ORIGINS = ['https://school.example'];
  config.CHART_URL = '';
  server = createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  sessions.clear();
});

function harness(fail, screenshots) {
  const bot = createBot({ screenshots }), calls = [];
  bot.botInfo = { id: 123456789, is_bot: true, first_name: 'Test', username: 'enzo_test_bot' };
  bot.api.config.use(async (prev, method, payload) => {
    calls.push({ method, payload });
    if (fail?.(method, payload)) throw new Error('Telegram temporary failure');
    if (payload.reply_markup?.inline_keyboard) {
      const buttons = payload.reply_markup.inline_keyboard.flat();
      assert.ok(buttons.length <= 100, 'Telegram keyboard limit');
      for (const button of buttons) if (button.callback_data) assert.ok(Buffer.byteLength(button.callback_data) <= 64, 'Callback byte limit');
    }
    if (method === 'getChatMember') return { ok: true, result: { status: 'administrator', user: { id: payload.user_id } } };
    if (method === 'sendMessage' || method === 'editMessageText') {
      assert.ok((payload.text || '').length <= 4096, 'Telegram message limit');
      return { ok: true, result: { message_id: sequence++, date: 1, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } };
    }
    return { ok: true, result: true };
  });
  const from = id => ({ id, is_bot: false, first_name: 'Test' });
  const msg = (id, text, extra = {}, chatId = id) => bot.handleUpdate({ update_id: sequence++, message: {
    message_id: sequence++, date: 1, from: from(id), chat: { id: chatId, type: chatId < 0 ? 'supergroup' : 'private', title: 'Guruh' },
    ...(text === null ? {} : { text }),
    ...(text?.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}), ...extra,
  } });
  const cb = (id, data, chatId = id) => bot.handleUpdate({ update_id: sequence++, callback_query: {
    id: String(sequence++), from: from(id), chat_instance: 'test', data,
    message: { message_id: 10, date: 1, chat: { id: chatId, type: chatId < 0 ? 'supergroup' : 'private' } },
  } });
  return { bot, calls, msg, cb };
}
async function student(name = 'Ali', telegramId = 100) {
  const user = await User.create({ full_name: name, name_key: name.toLowerCase(), password_hash: await bcrypt.hash('test-pass', 4), role: 'student', group_name: '1-guruh', status: 'active' });
  await TgLink.create({ telegram_id: telegramId, user: user._id });
  return user;
}
async function exam(section = 'reading', order = 1, examName = 'ielts') {
  return Test.create({ exam: examName, section, order, title: `${examName} ${section} ${order}`, materials: [{ kind: 'text', text: 'Test material' }], answer_key: [['A'], ['B']], max_score: section === 'writing' ? 9 : undefined });
}
async function answer(h, testDoc, text = '1-A 2-C') {
  await h.cb(100, `st:${testDoc._id}`);
  await h.msg(100, text);
  await h.cb(100, 'ans:ok');
}
const token = (user) => jwt.sign({ id: String(user._id) }, config.JWT_SECRET, { expiresIn: '1h' });
const request = (path, user, options = {}) => fetch(base + path, { ...options, headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), ...options.headers } });

test('Screenshot confirmation is owned, idempotent, visible in API and cannot unlock analysis', async t => {
  const original = config.GEMINI_API_KEY;
  config.GEMINI_API_KEY = 'test-only-fake-key';
  t.after(() => { config.GEMINI_API_KEY = original; });
  const user = await student(); await student('Vali', 200);
  const first = await exam();
  await Attempt.create({ user: user._id, test: first._id, exam: 'ielts', section: 'reading', status: 'analysis', pending: true, percent: 50 });
  let calls = 0;
  const h = harness(null, {
    downloadScreenshot: async () => ({ bytes: Buffer.from('test-image'), mime: 'image/png' }),
    readScreenshot: async () => { calls++; return { title: 'HTML mock 1', score_type: 'correct', score: 32, maximum: 40, percent: 80, model: 'mock' }; },
  });
  await h.msg(100, '/skrin');
  await h.cb(100, 'ss:ielts:reading');
  await h.msg(100, null, { photo: [{ file_id: 'image1', file_unique_id: 'image1', file_size: 100 }] });
  const row = await ScreenshotResult.findOne();
  assert.equal(row.status, 'draft');
  assert.equal(calls, 1);
  await h.cb(200, `ssok:${row._id}`);
  assert.equal((await ScreenshotResult.findById(row._id)).status, 'draft');
  await h.cb(100, `ssok:${row._id}`);
  await h.cb(100, `ssok:${row._id}`);
  assert.equal(await ScreenshotResult.countDocuments({ status: 'accepted' }), 1);
  assert.equal((await Attempt.findOne()).pending, true);
  assert.equal(await Attempt.countDocuments(), 1);
  const out = await (await request('/api/exams/results?exam=ielts', user)).json();
  assert.equal(out.screenshots[0].score_label, '32/40');
  assert.equal(out.screenshots[0].verified, false);
  assert.equal(out.screenshots[0].file_id, undefined);
  assert.equal(out.screenshots[0].telegram_id, undefined);
  await h.msg(100, '/skrin'); await h.cb(100, 'ss:ielts:reading');
  await h.msg(100, null, { photo: [{ file_id: 'image1', file_unique_id: 'image1' }] });
  assert.equal(calls, 1);
});

test('Screenshot AI failure creates no published score or altered attendance', async t => {
  const original = config.GEMINI_API_KEY;
  config.GEMINI_API_KEY = 'test-only-fake-key';
  t.after(() => { config.GEMINI_API_KEY = original; });
  await student();
  const h = harness(null, {
    downloadScreenshot: async () => ({ bytes: Buffer.from('unreadable-image'), mime: 'image/png' }),
    readScreenshot: async () => { throw new ScreenshotError('unreadable', 'Rasm noaniq'); },
  });
  await h.msg(100, '/skrin'); await h.cb(100, 'ss:cefr:writing');
  await h.msg(100, null, { photo: [{ file_id: 'bad', file_unique_id: 'bad' }] });
  assert.equal(await ScreenshotResult.countDocuments({ status: 'accepted' }), 0);
  assert.equal((await ScreenshotResult.findOne()).status, 'failed');
  assert.equal(await Attendance.countDocuments(), 0);
  assert.ok(h.calls.some(c => c.payload.text === 'Rasm noaniq'));
});

test('Attendance report freezes retries, includes only its group, queues late screenshots', async () => {
  const user = await student(), other = await student('Other group', 200);
  await User.updateOne({ _id: other._id }, { $set: { group_name: '2-guruh' } });
  const group = await GroupChat.create({ chat_id: -444, group_name: '1-guruh' });
  const makeResult = (u, id, title) => ScreenshotResult.create({
    user: u._id, telegram_id: u === user ? 100 : 200, file_id: id, file_unique_id: id,
    exam: 'ielts', section: 'reading', status: 'accepted', title, score_type: 'correct', score: 0, maximum: 40, percent: 0,
    submitted_at: new Date(Date.now() - 1000), accepted_at: new Date(Date.now() - 500),
  });
  const initial = await makeResult(user, 'initial', 'Initial result');
  await makeResult(other, 'foreign', 'Foreign result');
  await assert.rejects(attendance.postReport({ sendMessage: async () => { throw Error('offline'); } }, group, '2026-10-21', 'screenshot-report-1'));
  assert.deepEqual((await ScreenshotResult.findById(initial._id)).report_chats, []);
  const late = await makeResult(user, 'late', 'Late result');
  const sent = [];
  const api = { sendMessage: async (chat, text) => { sent.push({ chat, text }); } };
  await attendance.postReport(api, group, '2026-10-21', 'screenshot-report-1');
  assert.match(sent[0].text, /Initial result/);
  assert.doesNotMatch(sent[0].text, /Foreign result|Late result/);
  assert.deepEqual((await ScreenshotResult.findById(initial._id)).report_chats, [-444]);
  assert.deepEqual((await ScreenshotResult.findById(late._id)).report_chats, []);
  await attendance.postReport(api, group, '2026-10-22', 'screenshot-report-2');
  assert.match(sent[1].text, /Late result/);
  assert.doesNotMatch(sent[1].text, /Initial result|Foreign result/);
  await attendance.postReport(api, group, '2026-10-22', 'screenshot-report-2');
  assert.equal(sent.length, 2);
});

test('Reading → mandatory analysis → next test, including all sections and duplicate submit', async () => {
  const user = await student();
  const first = await exam(), next = await exam('reading', 2);
  await exam('listening'); await exam('reading', 1, 'cefr');
  const h = harness();
  await answer(h, first);
  await h.cb(100, 'ans:ok');
  assert.equal(await Attempt.countDocuments(), 1);
  assert.equal((await sectionState(user._id, 'ielts', 'reading')).rows[1].state, 'locked');
  assert.equal((await sectionState(user._id, 'ielts', 'listening')).rows[0].state, 'locked');
  assert.equal((await sectionState(user._id, 'cefr', 'reading')).rows[0].state, 'locked');
  await h.msg(100, 'short');
  assert.equal((await Attempt.findOne()).status, 'analysis');
  await h.msg(100, 'Men ikkinchi savolda kalit so‘zni noto‘g‘ri tushundim.');
  assert.equal((await Attempt.findOne()).status, 'done');
  assert.equal((await sectionState(user._id, 'ielts', 'reading')).rows[1].state, 'open');
  await h.cb(100, `st:${next._id}`);
  assert.equal((await BotSession.findOne({ telegram_id: 100 })).data.testId, String(next._id));
});

test('Perfect results still require a reflection', async () => {
  await student(); const first = await exam(); const h = harness();
  await answer(h, first, '1-A 2-B');
  assert.equal((await Attempt.findOne()).percent, 100);
  assert.equal((await Attempt.findOne()).status, 'analysis');
  await h.msg(100, 'Savoldagi sinonim orqali matndan to‘g‘ri javobni topdim.');
  assert.equal((await Attempt.findOne()).pending, false);
});

test('Writing is graded by admin and unlocked only after student reflection', async () => {
  await student(); const first = await exam('writing'); const h = harness();
  await h.cb(100, `st:${first._id}`);
  await h.msg(100, 'This is a long enough writing sample about learning English and studying every day.');
  const attempt = await Attempt.findOne(); assert.equal(attempt.status, 'grading');
  await h.cb(100, `wg:${attempt._id}`);
  assert.equal((await Attempt.findById(attempt._id)).status, 'grading');
  await h.cb(900, `wg:${attempt._id}`);
  await h.msg(900, '6.5');
  await h.msg(900, 'Improve paragraph structure and check subject verb agreement.');
  assert.equal((await Attempt.findById(attempt._id)).band, 6.5);
  await h.cb(100, `an:${attempt._id}`);
  await h.msg(100, 'I will make paragraphs clearer and check verbs before submitting.');
  assert.equal((await Attempt.findById(attempt._id)).status, 'done');
});

test('Admin material drafts survive restart; audio and PDF keep their order', async () => {
  const h = harness();
  await h.cb(900, 'ad:sec:cefr:listening');
  await h.msg(900, 'CEFR Listening 1');
  await h.msg(900, null, { audio: { file_id: 'audio-test', file_unique_id: 'a', duration: 5 } });
  sessions.clear();
  const restarted = harness();
  await restarted.msg(900, null, { document: { file_id: 'pdf-test', file_unique_id: 'b' } });
  await restarted.cb(900, 'ad:mdone');
  await restarted.msg(900, '1-A 2-B');
  const saved = await Test.findOne().lean();
  assert.deepEqual(saved.materials.map(m => m.kind), ['audio', 'document']);
  assert.equal(saved.answer_key.length, 2);
  assert.equal(await BotSession.countDocuments(), 0);
});

test('Revoked admin cannot finish a saved editing step', async () => {
  await student();
  await BotSession.create({ telegram_id: 100, expires_at: new Date(Date.now() + 60000), data: { step: 't_key', exam: 'ielts', section: 'reading', title: 'Forged', materials: [] } });
  await harness().msg(100, '1-A');
  assert.equal(await Test.countDocuments(), 0);
  assert.equal(await BotSession.countDocuments(), 0);
});

test('Private results and editing callbacks do not leak into group chats', async () => {
  await student(); const h = harness();
  await h.msg(100, '📊 Natijalarim', {}, -123);
  assert.equal(h.calls.length, 0);
  await h.cb(900, 'ad:sec:ielts:reading', -123);
  assert.equal(await BotSession.countDocuments(), 0);
  assert.equal(h.calls.at(-1).method, 'answerCallbackQuery');
});

test('Attendance pages include all 105 students and reject students from another group', async () => {
  const students = await User.insertMany(Array.from({ length: 105 }, (_, i) => ({ full_name: `Student ${String(i).padStart(3, '0')}`, role: 'student', group_name: '1-guruh' })));
  const group = await GroupChat.create({ chat_id: -123, group_name: '1-guruh', title: 'Test', enabled: true });
  const last = await attendance.sheet(group, '2026-10-21', 2);
  assert.match(last.text, /Sahifa 3\/3/);
  assert.equal(last.kb.inline_keyboard.flat().filter(b => b.callback_data.startsWith('a:')).length, 25);
  const h = harness();
  await h.cb(900, `a:${group._id}:${students[104]._id}:261021:2`);
  assert.equal((await Attendance.findOne({ user: students[104]._id })).status, 'present');
  await h.cb(900, `a:${group._id}:${students[104]._id}:261021:2`);
  assert.equal((await Attendance.findOne({ user: students[104]._id })).status, 'absent');
  const outsider = await User.create({ full_name: 'Other', role: 'student', group_name: '2-guruh' });
  await h.cb(900, `a:${group._id}:${outsider._id}:261021:2`);
  assert.equal(await Attendance.countDocuments({ user: outsider._id }), 0);
});

test('Attendance and payment reports split large rosters within Telegram limits', async () => {
  await User.insertMany(Array.from({ length: 150 }, (_, i) => ({ full_name: `Student ${i} & ${'FamilyName'.repeat(8)}`, role: 'student' })));
  const sent = [];
  const api = { sendMessage: async (id, text) => { assert.ok(text.length <= 4096); sent.push(text); } };
  await attendance.postReport(api, { chat_id: -123 }, '2026-10-21');
  assert.ok(sent.length > 1);
  assert.ok(sent.join('\n').includes('Student 149'));
  sent.length = 0;
  await payments.postReport(api, { chat_id: -123 });
  assert.ok(sent.length > 1);
  assert.ok(sent.join('\n').includes('Student 149'));
  const sheet = await payments.unpaidSheet({ _id: new mongoose.Types.ObjectId() }, 3);
  assert.equal(sheet.kb.inline_keyboard.flat().filter(b => b.callback_data.startsWith('pay:')).length, 30);
});

test('Concurrent payment confirmation writes one payment and keeps future prepaid dates', async () => {
  const user = await student();
  const now = new Date('2026-10-21T08:00:00Z');
  assert.equal((await payments.split({ group_name: '1-guruh' })).unpaid.length, 1);
  const results = await Promise.all([payments.markPaid(user._id, undefined, now), payments.markPaid(user._id, undefined, now)]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal((await User.findById(user._id)).payments.length, 1);
  await User.updateOne({ _id: user._id }, { $set: { status: 'blocked', subscription_end_date: new Date('2027-01-31T18:59:59Z') } });
  await payments.markPaid(user._id, undefined, now);
  assert.equal((await User.findById(user._id)).subscription_end_date.toISOString(), '2027-01-31T18:59:59.000Z');
});

test('Delivery retries failed sends, suppresses successful duplicates and recovers expired leases', async () => {
  let calls = 0;
  const send = async () => { calls++; if (calls === 1) throw new Error('offline'); };
  await assert.rejects(deliverOnce('job', send), /offline/);
  assert.equal((await JobLog.findOne()).state, 'failed');
  assert.equal(await deliverOnce('job', send), true);
  assert.equal(await deliverOnce('job', send), false);
  assert.equal(calls, 2);
  await JobLog.create({ key: 'crash', state: 'running', lease_until: new Date(0), owner: 'old' });
  assert.equal(await deliverOnce('crash', send), true);
  await JobLog.create({ key: 'legacy' });
  assert.equal(await deliverOnce('legacy', send), false);
});

test('Scheduler continues admin payment notices after group send fails, without duplicates on retry', async () => {
  await student();
  await GroupChat.create({ chat_id: -123, group_name: '1-guruh', pay_day: 21, pay_time: '10:00', days: [] });
  const sent = [], now = new Date('2026-10-21T05:00:00Z');
  let fail = true;
  const api = { sendMessage: async (id) => { if (id === -123 && fail) throw new Error('offline'); sent.push(id); } };
  await tick(api, now);
  assert.deepEqual(sent, [900]);
  fail = false;
  await tick(api, now); await tick(api, now);
  assert.deepEqual(sent, [900, -123]);
});

test('API isolates student results, allows admin access, rejects invalid tokens and enforces CORS', async () => {
  const user = await student(); const other = await student('Vali', 101);
  assert.equal((await request('/api/exams/results', null)).status, 401);
  assert.equal((await request('/api/exams/results?user_id=' + other._id, user)).status, 403);
  assert.equal((await request('/api/exams/results?exam=bad', user)).status, 400);
  assert.equal((await request('/api/exams/results', user, { headers: { Origin: 'https://unknown.example' } })).status, 403);
  const response = await request('/api/exams/results', user, { headers: { Origin: 'https://school.example' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://school.example');
  const body = await response.json(); assert.equal(body.student.id, String(user._id));
  await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });
  assert.equal((await request('/api/exams/results?user_id=' + other._id, user)).status, 200);
  assert.equal((await request('/health', null)).status, 200);
});

test('Application link endpoint issues hashed, one-use, expiring codes consumed by /start', async () => {
  const user = await student();
  await TgLink.deleteMany({});
  const response = await request('/api/telegram/link', user, { method: 'POST' });
  const body = await response.json();
  assert.equal(body.expires_in, 300);
  const code = new URL(body.url).searchParams.get('start');
  assert.equal((await LinkCode.findOne()).hash.length, 64);
  assert.ok(!JSON.stringify(await LinkCode.findOne()).includes(code.slice(5)));
  const h = harness();
  await h.msg(100, '/start ' + code);
  assert.equal(String((await TgLink.findOne({ telegram_id: 100 })).user), String(user._id));
  await h.msg(101, '/start ' + code);
  assert.equal(await TgLink.countDocuments(), 1);
  const expired = await issueLinkCode(user._id);
  await LinkCode.updateOne({ user: user._id }, { $set: { expires_at: new Date(0) } });
  await h.msg(101, '/start link_' + expired);
  assert.equal(await TgLink.countDocuments(), 1);
});

test('Personal charts retain retakes; leaderboard counts only the first attempt per test', async () => {
  const user = await student(); const first = await exam();
  await Attempt.create({ user: user._id, test: first._id, exam: 'ielts', section: 'reading', status: 'done', percent: 50, band: 5, createdAt: new Date('2026-10-20') });
  await Attempt.create({ user: user._id, test: first._id, exam: 'ielts', section: 'reading', status: 'done', percent: 100, band: 9, createdAt: new Date('2026-10-21') });
  assert.equal((await userResults(user._id, 'ielts')).items.length, 2);
  const board = await leaderboard('ielts');
  assert.equal(board[0].tests, 1); assert.equal(board[0].average_percent, 50);
});

test('Archived tests with unfinished analysis still block new tests', async () => {
  const user = await student(); const first = await exam(); await exam('listening');
  await Attempt.create({ user: user._id, test: first._id, exam: 'ielts', section: 'reading', status: 'analysis', percent: 50 });
  await Test.updateOne({ _id: first._id }, { $set: { active: false } });
  assert.equal((await sectionState(user._id, 'ielts', 'listening')).rows[0].state, 'locked');
});

test('An administrator cannot silently rewrite the answer key of an attempted test', async () => {
  const user = await student(); const first = await exam();
  await Attempt.create({ user: user._id, test: first._id, exam: 'ielts', section: 'reading', status: 'done', percent: 50 });
  const h = harness();
  await h.cb(900, `adk:${first._id}`); await h.msg(900, '1-X 2-Y');
  assert.deepEqual((await Test.findById(first._id)).answer_key.map(v => Array.from(v)), [['A'], ['B']]);
});
