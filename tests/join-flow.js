const assert = require('node:assert/strict');
const config = require('../src/config');
const { BioGroup: Group, BioMock: Mock, BioProfile: Profile, BioAttempt: Attempt, BioPackage: Package } = require('../src/storage/postgres');
const service = require('../src/biology/service');
const { snapshot } = require('../src/biology/catalog');
const { validatePackage } = require('../src/biology/importer');
const { handleApi } = require('../src/biology/api');
const { issueSession } = require('../src/biology/auth');

module.exports = async function joinFlow({ msg, cb, outsider, bot, checks, calls }) {
  const ok = (value, label) => { assert.ok(value, label); checks.push(label); };
  const user = 991000020, other = 991000021;
  const group = await Group.create({ chat_id: -100991000020, title: 'Join fixture' });
  const sample = require('../examples/mock-30/import.json');
  const data = snapshot(await Package.create({ ...validatePackage(sample.mock, sample.answer_key), mock_id:'BIO7-JOIN',status: 'approved' }));
  config.MINIAPP_URL = 'https://biology.example/?theme=dark';
  let m = await Mock.create({ ...data, code: 'c00101', group_id: group._id, status: 'scheduled',
    starts_at: new Date(Date.now() - 1000), ends_at: new Date(Date.now() + 3600_000) });
  await service.openMock(bot.api, group, m, new Date()); m = await Mock.findById(m._id);
  const announcement = calls.find(c => c.method === 'sendMessage' && c.payload.chat_id === group.chat_id && c.payload.text.includes(`#${m.code}`));
  ok(announcement.payload.reply_markup.inline_keyboard[0][0].callback_data === `bjoin:${m.code}`,
    'group participation button identifies the exact announced mock');

  let from = calls.length;
  await cb(user, `bjoin:${m.code}`, group.chat_id);
  const redirect = calls.slice(from).find(c => c.method === 'answerCallbackQuery');
  ok(redirect.payload.url === `https://t.me/${config.BOT_USERNAME}?start=m_${m.code}` && redirect.payload.cache_time === 0 &&
    (await Profile.findOne({ telegram_id: user })).group_ids.includes(group._id) && (await Mock.findById(m._id)).roster.includes(user),
    'participation verifies membership, enrolls the user and redirects to the bot with the mock');
  await cb(user, `bjoin:${m.code}`, group.chat_id);
  ok((await Mock.findById(m._id)).roster.filter(id => id === user).length === 1,
    'repeated participation clicks do not duplicate the roster');
  from = calls.length;
  await msg(user, `/start m_${m.code}`);
  const replies = calls.slice(from).filter(c => c.method === 'sendMessage');
  const button = replies[0]?.payload.reply_markup?.inline_keyboard[0][0];
  const url = new URL(button?.web_app?.url || 'https://invalid.example');
  ok(replies.length === 1 && button?.text === '🧬 Testni boshlash' && url.searchParams.get('run') === m._id &&
    url.searchParams.get('theme') === 'dark' && replies[0].payload.text.includes('ro‘yxatiga qo‘shildingiz'),
    'bot deep link presents one direct Mini App button for the selected mock without another menu');
  ok(!await Attempt.exists({ mock_id: m._id, telegram_id: user }), 'opening the participation card does not consume an attempt or retake');
  const request = (id, run_id) => handleApi(new Request('https://backend.example/api/start', {
    method: 'POST', headers: { origin: 'https://biology.example', 'content-type': 'application/json',
      authorization: `Bearer ${issueSession({ id, first_name: 'Join student' }, config.BOT_TOKEN)}` }, body: JSON.stringify({ run_id }),
  }), { api: bot.api });
  const response = await request(user, url.searchParams.get('run')), body = await response.json();
  ok(response.status === 200 && body.mock.run_id === m._id && body.mock.questions.length === 30 &&
    !JSON.stringify(body).includes('answer_key'), 'Mini App starts that exact mock through the authenticated API without revealing its key');

  from = calls.length; await cb(outsider, `bjoin:${m.code}`, group.chat_id);
  ok(!calls.slice(from).some(c => c.method === 'answerCallbackQuery' && c.payload.url) &&
    !(await Mock.findById(m._id)).roster.includes(outsider), 'non-members cannot use the participation redirect or enter the roster');
  ok((await request(outsider, m._id)).status === 400, 'direct Mini App links still reject non-members at the API');
  from = calls.length; await cb(other, `bjoin:${m.code}`, group.chat_id - 1);
  ok(!calls.slice(from).some(c => c.method === 'answerCallbackQuery' && c.payload.url) &&
    !(await Mock.findById(m._id)).roster.includes(other), 'participation callbacks cannot be replayed in another group');

  from = calls.length; await cb(other, `bj:${group._id}`, group.chat_id, m.announcement_id);
  ok(calls.slice(from).some(c => c.method === 'answerCallbackQuery' && c.payload.url?.endsWith(`start=m_${m.code}`)),
    'existing group-only buttons recover the exact mock from their announcement and redirect');
  from = calls.length; await msg(other, `/start g_${group._id}`);
  ok(calls.slice(from).some(c => c.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url.includes(`run=${m._id}`)),
    'generic group invitation opens its sole active mock directly');
  from = calls.length; await msg(user, '/mock');
  ok(calls.slice(from).some(c => c.payload.reply_markup?.inline_keyboard?.some(row => row.some(b => b.callback_data === `bm:${m.code}`))),
    'ordinary mock menu still lists enrolled group tests');

  let future = await Mock.create({ ...data, code: 'c00102', group_id: group._id, status: 'scheduled',
    starts_at: new Date(Date.now() + 600_000), ends_at: new Date(Date.now() + 4200_000) });
  from = calls.length; await msg(other, `/start m_${future.code}`);
  ok(calls.slice(from).some(c => c.payload.text?.includes('Test hali boshlanmagan')) &&
    !calls.slice(from).some(c => c.payload.reply_markup?.inline_keyboard?.flat().some(b => b.web_app)) &&
    !await Attempt.exists({ mock_id: future._id, telegram_id: other }), 'early participation registers the member but keeps the Mini App test locked');
  await Mock.updateOne({ _id: future._id }, { $set: { starts_at: new Date(Date.now() - 1000) } });
  await service.openMock(bot.api, group, await Mock.findById(future._id), new Date());
  from = calls.length; await cb(other, `bm:${future.code}`);
  ok((await Mock.findById(future._id)).roster.includes(other) && calls.slice(from).some(c =>
    c.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url.includes(`run=${future._id}`)),
    'pre-registered member can open the exact test once it starts');
  from = calls.length; await msg(other, `/start g_${group._id}`);
  const chooser = calls.slice(from).find(c => c.payload.text === 'Mockni tanlang:');
  const choices = chooser?.payload.reply_markup.inline_keyboard.flat().map(b => b.callback_data).sort();
  ok(JSON.stringify(choices) === JSON.stringify([`bm:${m.code}`, `bm:${future.code}`].sort()),
    'group invitation offers a choice when multiple mocks are open instead of guessing');

  await Mock.updateOne({ _id: m._id }, { $set: { status: 'cancelled' } });
  from = calls.length; await cb(user, `bjoin:${m.code}`, group.chat_id);
  ok(!calls.slice(from).some(c => c.method === 'answerCallbackQuery' && c.payload.url), 'cancelled test participation links are rejected');
  await Group.updateOne({ _id: group._id }, { $set: { enabled: false } });
  from = calls.length; await msg(other, `/start m_${future.code}`);
  ok(calls.slice(from).some(c => c.payload.text?.includes('Guruh ulanmagan')),
    'disabled group cannot reopen a test through a private deep link');
};
