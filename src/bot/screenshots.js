const { createHash } = require('crypto');
const { InlineKeyboard } = require('grammy');
const config = require('../config');
const { ScreenshotResult, Test } = require('../models/bot');
const { canStart } = require('./tests');
const reader = require('../lib/screenshot-reader');
const { EXAM_NAMES, SECTION_NAMES } = require('../lib/stats');
const { getSession, setSession, clearSession, steps, linkedUser, BTN, esc } = require('./common');

const DAY = 24 * 3600_000;
const cancel = () => new InlineKeyboard().text('Bekor qilish', 'cancel');
const confirmKeyboard = id => new InlineKeyboard().text('✅ Natija to‘g‘ri', `ssok:${id}`).row().text('❌ Noto‘g‘ri o‘qildi', `ssno:${id}`);

function screenshotFile(message) {
  if (message.photo?.length) return message.photo.at(-1);
  const doc = message.document;
  if (doc && ['image/png', 'image/jpeg', 'image/webp'].includes(doc.mime_type)) return doc;
  return null;
}

async function student(ctx) {
  const user = await linkedUser(ctx.from.id);
  if (!user || user.role !== 'student') {
    await ctx.reply('Avval ro‘yxatdan o‘ting: /start');
    return null;
  }
  if (config.STANDALONE && !user.group_ids?.length) {
    await ctx.reply('Guruhingizdagi ro‘yxatdan o‘tish tugmasini qayta bosing.');
    return null;
  }
  return user;
}

async function begin(ctx, file) {
  if (config.STANDALONE) {
    if (getSession(ctx.from.id)?.testId) return ctx.reply('Tanlangan material saqlangan. Testni ishlab, skrinshotini shu chatga yuboring.');
    if (file) await ctx.reply('Avval «Materiallar»dan ishlagan testingizni tanlang, keyin skrinshotni yuboring.');
    return require('./materials').showCatalog(ctx);
  }
  if (!(await student(ctx))) return;
  if (!config.GEMINI_API_KEY) return ctx.reply('Skrinshot AI xizmati hali sozlanmagan. Adminga murojaat qiling.');
  if (getSession(ctx.from.id)) return ctx.reply('Boshlangan ishni yakunlang yoki /cancel bosing, keyin /skrin orqali yuboring.');
  setSession(ctx.from.id, { step: 'screenshot_pick', file: file ? {
    file_id: file.file_id, file_unique_id: file.file_unique_id, file_size: file.file_size,
  } : undefined });
  const kb = new InlineKeyboard();
  for (const exam of ['ielts', 'cefr']) {
    for (const section of Object.keys(SECTION_NAMES)) kb.text(`${EXAM_NAMES[exam]} ${SECTION_NAMES[section]}`, `ss:${exam}:${section}`).row();
  }
  kb.text('Bekor qilish', 'cancel');
  return ctx.reply('📷 Natija qaysi bo‘limga tegishli?\nRasmni Gemini o‘qiydi. Ballni tasdiqlasangiz, u guruhingizning davomat hisobotiga qo‘shiladi.', { reply_markup: kb });
}

function preview(row) {
  return `📷 <b>Rasmdan o‘qilgan natija</b>\n${EXAM_NAMES[row.exam]} · ${SECTION_NAMES[row.section]}\n${esc(row.title)}\n\n<b>${reader.scoreLabel(row)}</b>\n\nRasmdagi ball bilan bir xilmi? Tasdiqlangan natija davomat bilan guruhga yuboriladi. Bu rasmning haqiqiyligini tasdiqlamaydi.`;
}

async function processScreenshot(ctx, s, file, dependencies = reader) {
  const user = await student(ctx);
  if (!user) return;
  if (config.STANDALONE && !s.testId) return ctx.reply('Avval «Materiallar»dan testni tanlang.');
  const selected = s.testId ? await Test.findOne({ _id: s.testId, active: true }).lean() : null;
  if (s.testId && (!selected || !(await canStart(user._id, selected)))) {
    clearSession(ctx.from.id);
    return ctx.reply('Material o‘chirilgan yoki avvalgi tahlil tugallanmagan. /tahlil yoki /materiallar');
  }
  const replyTo = ctx.message?.reply_to_message;
  if (s.testId && replyTo?.from?.is_bot && s.contextMessageIds?.length && !s.contextMessageIds.includes(replyTo.message_id)) {
    return ctx.reply('Bu javob boshqa xabarga bog‘langan. Tanlangan materialning tagiga javob bering yoki rasmni yangi xabar qilib yuboring.');
  }
  if (!file?.file_id || !file.file_unique_id) return ctx.reply('Natijani JPG, PNG yoki WEBP rasm qilib yuboring.');
  if (!config.GEMINI_API_KEY) return ctx.reply('Skrinshot AI xizmati hali sozlanmagan.');
  if (file.file_size > reader.MAX_IMAGE_BYTES) return ctx.reply('Rasm 6 MB dan kichik bo‘lsin.');
  const existing = await ScreenshotResult.findOne({ file_unique_id: file.file_unique_id }).lean();
  if (existing && String(existing.test || '') !== String(s.testId || '')) return ctx.reply('Bu rasm boshqa material uchun yuborilgan. Shu testning natijasini yuboring.');
  if (existing && (String(existing.user) !== String(user._id) || existing.status === 'accepted')) {
    return ctx.reply('Bu rasm oldin yuborilgan. Yangi ishlangan test natijasini yuboring.');
  }
  if (existing?.status === 'draft' && existing.draft_until > new Date()) {
    setSession(ctx.from.id, { ...s, step: 'screenshot_confirm', resultId: String(existing._id) });
    return ctx.reply(preview(existing), { parse_mode: 'HTML', reply_markup: confirmKeyboard(existing._id) });
  }
  const now = new Date();
  if (existing?.status === 'processing' && now - existing.updatedAt < 5 * 60_000) return ctx.reply('Bu rasm hali o‘qilmoqda. Biroz kuting.');
  const usage = await ScreenshotResult.aggregate([
    { $match: { user: user._id, submitted_at: { $gte: new Date(now - DAY) } } },
    { $group: { _id: null, count: { $sum: '$read_count' } } },
  ]);
  if ((usage[0]?.count || 0) >= 10) return ctx.reply('24 soatda 10 ta AI o‘qish chegarasiga yetdingiz. Keyinroq yuboring.');
  const data = { user: user._id, telegram_id: ctx.from.id, file_id: file.file_id, file_unique_id: file.file_unique_id,
    test: selected?._id,
    exam: s.exam, section: s.section, status: 'processing', submitted_at: now, expires_at: new Date(+now + 7 * DAY) };
  let row;
  try {
    row = existing
      ? await ScreenshotResult.findOneAndUpdate({ _id: existing._id, status: existing.status }, { $set: data, $inc: { read_count: 1 } }, { new: true })
      : await ScreenshotResult.create(data);
  } catch (error) {
    if (error.code === 11000) return ctx.reply('Bu rasm allaqachon qabul qilinmoqda.');
    throw error;
  }
  if (!row) return ctx.reply('Natija holati o‘zgardi. /skrin orqali qayta oching.');
  await ctx.reply('⏳ Rasmdagi natija o‘qilmoqda…');
  try {
    const image = await dependencies.downloadScreenshot(ctx.api, file);
    const hash = createHash('sha256').update(image.bytes).digest('hex');
    await ScreenshotResult.updateOne({ _id: row._id }, { $set: { image_hash: hash } });
    const extracted = await dependencies.readScreenshot(image, { exam: s.exam, section: s.section, title: selected?.title });
    const values = { ...extracted, title: selected?.title || extracted.title, status: 'draft', draft_until: new Date(Date.now() + 30 * 60_000) };
    await ScreenshotResult.updateOne({ _id: row._id, status: 'processing' }, { $set: values });
    setSession(ctx.from.id, { ...s, step: 'screenshot_confirm', resultId: String(row._id) });
    return ctx.reply(preview({ ...data, ...values }), { parse_mode: 'HTML', reply_markup: confirmKeyboard(row._id) });
  } catch (error) {
    await ScreenshotResult.updateOne({ _id: row._id, status: { $ne: 'accepted' } }, { $set: { status: 'failed' } });
    setSession(ctx.from.id, { ...s, step: 'screenshot_image' });
    const message = error.code === 11000 ? 'Bu rasm oldin yuborilgan. Boshqa natija yuboring.'
      : error instanceof reader.ScreenshotError ? error.message : 'Natija saqlanmadi. Birozdan keyin qayta yuboring.';
    return ctx.reply(message, { reply_markup: cancel() });
  }
}

async function beginMaterialAnalysis(ctx, id) {
  const user = await student(ctx);
  if (!user) return;
  const row = await ScreenshotResult.findOne({ _id: id, user: user._id, status: 'accepted', needs_analysis: true }).lean();
  if (!row) return ctx.reply('Tugallanmagan tahlil topilmadi.');
  setSession(ctx.from.id, { step: 'material_analysis', resultId: String(row._id) });
  return ctx.reply(`🧠 <b>${esc(row.title)} — tahlil</b>\nQaysi savollarda xato qildingiz, nima sabab bo‘ldi va keyingi safar nimani o‘zgartirasiz?\nKamida ${config.MIN_ANALYSIS_CHARS} belgi yozing. Tahlildan so‘ng keyingi material ochiladi.`, { parse_mode: 'HTML' });
}

function register(bot, dependencies = reader) {
  bot.command('skrin', ctx => begin(ctx));
  bot.hears(BTN.screenshot, ctx => begin(ctx));
  bot.callbackQuery(/^sa:([a-f\d]{24})$/, async ctx => {
    await ctx.answerCallbackQuery();
    return beginMaterialAnalysis(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^ss:(ielts|cefr):(reading|listening|writing)$/, async ctx => {
    await ctx.answerCallbackQuery();
    const s = getSession(ctx.from.id);
    if (s?.step !== 'screenshot_pick') return ctx.reply('Tanlov eskirgan. /skrin orqali boshlang.');
    const next = { step: 'screenshot_image', exam: ctx.match[1], section: ctx.match[2] };
    setSession(ctx.from.id, next);
    if (s.file) return processScreenshot(ctx, next, s.file, dependencies);
    return ctx.reply('Natijaning to‘liq skrinshotini yuboring. Test nomi, ball va maksimal ball aniq ko‘rinsin. JPG/PNG/WEBP, 6 MB gacha.', { reply_markup: cancel() });
  });
  bot.callbackQuery(/^ss(ok|no):([a-f\d]{24})$/, async ctx => {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    if (session?.step !== 'screenshot_confirm' || session.resultId !== ctx.match[2]) {
      return ctx.reply('Bu tasdiq oynasi yopilgan. /skrin orqali qayta yuboring.');
    }
    const user = await student(ctx);
    if (!user) return;
    const now = new Date(), accept = ctx.match[1] === 'ok';
    const draft = await ScreenshotResult.findOne({ _id: ctx.match[2], user: user._id, telegram_id: ctx.from.id, status: 'draft', draft_until: { $gt: now } }).lean();
    if (!draft) return ctx.reply('Natija topilmadi yoki tasdiqlash muddati tugagan.');
    if (accept && draft.test) {
      const selected = await Test.findOne({ _id: draft.test, active: true }).lean();
      if (!selected || !(await canStart(user._id, selected))) return ctx.reply('Material o‘chirilgan yoki avvalgi tahlil tugallanmagan. /tahlil');
    }
    const update = accept
      ? { $set: { status: 'accepted', accepted_at: now, needs_analysis: Boolean(draft.test) }, $unset: { expires_at: 1 } }
      : { $set: { status: 'rejected' } };
    const row = await ScreenshotResult.findOneAndUpdate({ _id: ctx.match[2], user: user._id,
      telegram_id: ctx.from.id, status: 'draft', draft_until: { $gt: now } }, update, { new: true }).lean();
    if (!row) return ctx.reply('Tasdiq allaqachon bajarilgan yoki 30 daqiqalik muddat tugagan. /skrin orqali qayta yuboring.');
    if (getSession(ctx.from.id)?.resultId === String(row._id)) clearSession(ctx.from.id);
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.reply(accept
      ? '✅ Natija saqlandi. Ulangan guruhingizning navbatdagi davomat hisobotiga qo‘shiladi. Hisobot vaqti o‘tgan bo‘lsa, keyingi hisobotga tushadi.'
      : 'Natija guruhga yuborilmaydi. Aniqroq skrinshot yuboring.');
    if (accept && row.test) return beginMaterialAnalysis(ctx, String(row._id));
    if (!accept && row.test) setSession(ctx.from.id, { ...session, step: 'screenshot_image' });
  });
  // Other active workflows retain ownership of images (admin uploads, Writing etc.).
  bot.on(['message:photo', 'message:document'], (ctx, next) => {
    if (getSession(ctx.from.id)) return next();
    const file = screenshotFile(ctx.message);
    return file ? begin(ctx, file) : next();
  });
  steps.screenshot_pick = ctx => ctx.reply('Yuqoridagi imtihon/bo‘lim tugmasini bosing yoki /cancel.');
  steps.screenshot_confirm = async (ctx, s) => {
    const user = await student(ctx);
    if (!user) return;
    const row = await ScreenshotResult.findOne({ _id: s.resultId, user: user._id, status: 'draft', draft_until: { $gt: new Date() } }).lean();
    if (!row) { clearSession(ctx.from.id); return ctx.reply('Tasdiqlash muddati tugagan. Qayta yuboring: /skrin'); }
    return ctx.reply(preview(row), { parse_mode: 'HTML', reply_markup: confirmKeyboard(row._id) });
  };
  steps.screenshot_image = (ctx, s) => processScreenshot(ctx, s, screenshotFile(ctx.message), dependencies);
  steps.material_analysis = async (ctx, s) => {
    const user = await student(ctx);
    if (!user) return;
    const analysis = (ctx.message.text || '').trim();
    if (analysis.length < config.MIN_ANALYSIS_CHARS || analysis.length > 2000) return ctx.reply(`Tahlilni ${config.MIN_ANALYSIS_CHARS}–2000 belgi bilan yozing.`);
    const result = await ScreenshotResult.updateOne({ _id: s.resultId, user: user._id, status: 'accepted', needs_analysis: true }, {
      $set: { analysis, needs_analysis: false, analyzed_at: new Date() },
    });
    clearSession(ctx.from.id);
    return ctx.reply(result.modifiedCount ? '✅ Tahlil saqlandi. Keyingi material ochildi. /materiallar' : 'Tahlil topilmadi yoki allaqachon tugallangan. /materiallar');
  };
}

module.exports = { register, screenshotFile, preview, processScreenshot, beginMaterialAnalysis };
