const { InlineKeyboard } = require('grammy');
const config = require('../config');
const { Test } = require('../models/bot');
const { sectionState, canStart, pendingWork, STATE_ICON } = require('./tests');
const { EXAM_NAMES, SECTION_NAMES } = require('../lib/stats');
const { BTN, esc, linkedUser, getSession, setSession, sendMaterial } = require('./common');

async function student(ctx) {
  const user = await linkedUser(ctx.from.id);
  if (!user || user.role !== 'student' || config.STANDALONE && !user.group_ids?.length) {
    await ctx.reply(config.STANDALONE ? 'Avval guruhingizdagi «Botga ro‘yxatdan o‘tish» tugmasidan kiring.' : 'Avval kiring: /start');
    return null;
  }
  return user;
}

async function showCatalog(ctx) {
  if (!(await student(ctx))) return;
  return ctx.reply('📚 Materiallar — imtihonni tanlang:', {
    reply_markup: new InlineKeyboard().text('🇬🇧 IELTS', 'mat:ielts').text('🇪🇺 CEFR', 'mat:cefr'),
  });
}

async function showList(ctx, exam, section, requestedPage = 0) {
  const user = await student(ctx);
  if (!user) return;
  const { rows, pending } = await sectionState(user._id, exam, section);
  const pages = Math.max(1, Math.ceil(rows.length / 40));
  const page = Math.min(Math.max(0, requestedPage), pages - 1);
  const kb = new InlineKeyboard();
  if (pending?.status === 'analysis') kb.text('🧠 Tahlilni davom ettirish', `${pending.source === 'screenshot' ? 'sa' : 'an'}:${pending._id}`).row();
  rows.slice(page * 40, (page + 1) * 40).forEach(r => kb.text(`${STATE_ICON[r.state]} ${r.test.title}`.slice(0, 60), `mf:${r.test._id}`).row());
  if (page) kb.text('⬅️', `ml:${exam}:${section}:${page - 1}`);
  if (page + 1 < pages) kb.text('➡️', `ml:${exam}:${section}:${page + 1}`);
  kb.row().text('⬅️ Bo‘limlar', `mat:${exam}`);
  return ctx.editMessageText(`📚 ${EXAM_NAMES[exam]} · ${SECTION_NAMES[section]}\n` +
    (rows.length ? `Materialni bosing — fayllari yuboriladi.\nSahifa ${page + 1}/${pages}\n🔒 Keyingi material oldingi test tahlilidan so‘ng ochiladi.` : 'Hozircha material joylanmagan.'),
    { reply_markup: kb });
}

async function openMaterial(ctx, id) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const user = await student(ctx);
  if (!user) return;
  const pending = await pendingWork(user._id);
  if (pending) {
    if (pending.source === 'screenshot') return require('./screenshots').beginMaterialAnalysis(ctx, String(pending._id));
    return ctx.reply('Avval oldingi test tahlili yoki tekshiruvini yakunlang. /tahlil');
  }
  const test = await Test.findOne({ _id: id, active: true }).lean();
  if (!test || !test.materials?.length) return ctx.reply('Material topilmadi yoki o‘chirilgan.');
  if (!(await canStart(user._id, test))) return ctx.reply('🔒 Avval shu bo‘limdagi oldingi materialni ishlab, tahlil qiling.');
  const session = getSession(ctx.from.id);
  if (session && !(session.step === 'screenshot_image' && session.testId === String(test._id))) {
    return ctx.reply('Boshlangan ish saqlangan. Uni yakunlang yoki /cancel bosing, keyin materialni tanlang.');
  }
  const messageIds = [];
  await ctx.reply(`📎 <b>${esc(test.title)}</b>\n${EXAM_NAMES[test.exam]} · ${SECTION_NAMES[test.section]}`, { parse_mode: 'HTML' });
  for (const material of test.materials) {
    const sent = await sendMaterial(ctx.api, ctx.chat.id, material);
    if (sent?.message_id) messageIds.push(sent.message_id);
  }
  // Save context before the footer; a transient footer error must not lose the selected material.
  const next = { step: 'screenshot_image', testId: String(test._id), exam: test.exam, section: test.section, contextMessageIds: messageIds };
  setSession(ctx.from.id, next);
  const prompt = await ctx.reply('📝 Testni ishlab bo‘lgach, natija skrinshotini shu chatga yuboring.\n' +
    `📌 Material: ${test.title}\nAI rasmdagi ballni o‘qiydi. Rasm JPG/PNG/WEBP, 6 MB gacha bo‘lsin.`,
    { reply_markup: new InlineKeyboard().text('Bekor qilish', 'cancel') });
  if (prompt?.message_id) next.contextMessageIds.push(prompt.message_id);
}

function register(bot) {
  bot.command('materiallar', showCatalog);
  bot.hears(BTN.materials, showCatalog);
  bot.callbackQuery(/^mat:(ielts|cefr)$/, async ctx => {
    await ctx.answerCallbackQuery();
    if (!(await student(ctx))) return;
    const kb = new InlineKeyboard();
    for (const section of Object.keys(SECTION_NAMES)) kb.text(SECTION_NAMES[section], `ml:${ctx.match[1]}:${section}:0`).row();
    return ctx.editMessageText(`${EXAM_NAMES[ctx.match[1]]} — bo‘limni tanlang:`, { reply_markup: kb });
  });
  bot.callbackQuery(/^ml:(ielts|cefr):(reading|listening|writing):(\d{1,5})$/, async ctx => {
    await ctx.answerCallbackQuery();
    return showList(ctx, ctx.match[1], ctx.match[2], Number(ctx.match[3]));
  });
  bot.callbackQuery(/^mf:([a-f\d]{24})$/, ctx => openMaterial(ctx, ctx.match[1]));
}

module.exports = { register, showCatalog, openMaterial, showList };
