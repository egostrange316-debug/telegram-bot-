const { InlineKeyboard } = require('grammy');
const { User } = require('../models/app');
const { Test, Attempt, GroupChat, ScreenshotResult } = require('../models/bot');
const { TgLink } = require('../models/bot');
const { parseKey, parseWritingScore, cefrLevel } = require('../lib/grading');
const { SECTION_NAMES, EXAM_NAMES } = require('../lib/stats');
const { dateKey } = require('../lib/time');
const {
  getSession, setSession, clearSession, steps, esc, isAdmin, actorUserId,
  BTN, sendMaterial, materialFromMessage, safeSend,
} = require('./common');
const attendance = require('./attendance');

const DAY_NAMES = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

/** Admin bo'lmasa jim o'tkazib yuboradi */
const adminOnly = (fn) => async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) {
    if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: 'Faqat admin uchun' });
    return null;
  }
  return fn(ctx);
};

const examKb = (prefix) => new InlineKeyboard().text('🇬🇧 IELTS', `${prefix}:ielts`).text('🇪🇺 CEFR', `${prefix}:cefr`);
const sectionKb = (prefix, exam) => new InlineKeyboard()
  .text('📖 Reading', `${prefix}:${exam}:reading`).text('🎧 Listening', `${prefix}:${exam}:listening`).text('✍️ Writing', `${prefix}:${exam}:writing`);

/* ------------------------------ test qo'shish ------------------------------ */

steps.t_title = async (ctx, s) => {
  const title = (ctx.message.text || '').trim();
  if (!title || title.length > 100) return ctx.reply('Test nomini matn bilan yozing (100 belgigacha).');
  setSession(ctx.from.id, { ...s, step: 't_materials', title, materials: [] });
  const what = s.submissionMode === 'screenshot' ? 'HTML test fayli, PDF, audio yoki boshqa materiallar' : s.section === 'listening' ? 'audio (mp3), savollar (PDF/rasm/matn)' : s.section === 'reading' ? 'matn, PDF yoki rasmlar' : 'topshiriq (matn, rasm yoki PDF)';
  return ctx.reply(
    `📎 Endi materiallarni birma-bir yuboring: ${what}.\nO'quvchiga aynan shu tartibda yuboriladi.\n\nTugatgach «✅ Materiallar tayyor» ni bosing.`,
    { reply_markup: new InlineKeyboard().text('✅ Materiallar tayyor', 'ad:mdone').row().text('✖️ Bekor qilish', 'cancel') }
  );
};

steps.t_materials = async (ctx, s) => {
  if (s.materials.length >= 100) return ctx.reply('100 ta material qo‘shildi. «Materiallar tayyor» tugmasini bosing.');
  const m = materialFromMessage(ctx.message);
  if (!m) return ctx.reply("Bu turdagi xabar qabul qilinmaydi. Matn, audio, fayl, rasm yoki video yuboring.");
  s.materials.push(m);
  return ctx.reply(`➕ Qo'shildi (${s.materials.length} ta material).`, {
    reply_markup: new InlineKeyboard().text('✅ Materiallar tayyor', 'ad:mdone').row().text('✖️ Bekor qilish', 'cancel'),
  });
};

async function materialsDone(ctx) {
  const s = getSession(ctx.from.id);
  if (!s || s.step !== 't_materials') return ctx.answerCallbackQuery({ text: 'Eskirgan tugma' });
  if (!s.materials.length) return ctx.answerCallbackQuery({ text: 'Kamida bitta material yuboring', show_alert: true });
  await ctx.answerCallbackQuery();
  if (s.submissionMode === 'screenshot') return saveTest(ctx, s, []);
  if (s.section === 'writing') return saveTest(ctx, s, []);
  setSession(ctx.from.id, { ...s, step: 't_key' });
  return ctx.reply(
    '🔑 Javob kalitini yuboring. Masalan:\n<code>1-A 2-C 3-true 4-not given 5-colour/color</code>\n' +
      'yoki har qatorda bittadan. Bir nechta to\'g\'ri variant bo\'lsa "/" bilan ajrating.',
    { parse_mode: 'HTML' }
  );
}

steps.t_key = async (ctx, s) => {
  const key = parseKey(ctx.message.text || '');
  const empty = key.findIndex((v) => !v.length);
  if (!key.length) return ctx.reply('Javob kaliti topilmadi. Qaytadan yuboring.');
  if (key.length > 200 || key.some((v) => v.some((answer) => answer.length > 100))) return ctx.reply('Ko‘pi bilan 200 savol, har javob 100 belgigacha.');
  if (empty !== -1) return ctx.reply(`${empty + 1}-savol javobi yo'q. Kalitni to'liq qaytadan yuboring.`);
  if (s.editTestId) {
    if (await Attempt.exists({ test: s.editTestId })) return ctx.reply('Bu testni o‘quvchi ishlab bo‘lgan. Natijalarni o‘zgartirmaslik uchun yangi test yarating. /cancel');
    await Test.updateOne({ _id: s.editTestId }, { $set: { answer_key: key } });
    clearSession(ctx.from.id);
    return ctx.reply(`✅ Javob kaliti yangilandi (${key.length} ta savol).`);
  }
  return saveTest(ctx, s, key);
};

async function saveTest(ctx, s, key) {
  const last = await Test.findOne({ exam: s.exam, section: s.section }).sort({ order: -1 }).select('order').lean();
  const test = await Test.create({
    exam: s.exam, section: s.section, title: s.title, order: (last ? last.order : 0) + 1,
    materials: s.materials, answer_key: key,
    submission_mode: s.submissionMode || 'answers',
    max_score: s.section === 'writing' ? (s.exam === 'ielts' ? 9 : 75) : undefined,
  });
  clearSession(ctx.from.id);
  const preview = key.length ? `\n🔑 ${key.length} ta savol: ${key.slice(0, 10).map((v, i) => `${i + 1}) ${v.join('/')}`).join(', ')}${key.length > 10 ? ' …' : ''}` : '';
  return ctx.reply(`✅ Test saqlandi: <b>${esc(test.title)}</b>\n${EXAM_NAMES[test.exam]} · ${SECTION_NAMES[test.section]} · №${test.order}\n📎 ${test.materials.length} ta material${esc(preview)}`, { parse_mode: 'HTML' });
}

/* ------------------------------ testlar ro'yxati ------------------------------ */

async function listTests(ctx, exam, section, requestedPage = 0) {
  const tests = await Test.find({ exam, section, active: true }).sort({ order: 1 }).lean();
  const kb = new InlineKeyboard();
  const pages = Math.max(1, Math.ceil(tests.length / 40));
  const page = Math.min(Math.max(0, requestedPage), pages - 1);
  tests.slice(page * 40, (page + 1) * 40).forEach((t, i) => kb.text(`${page * 40 + i + 1}. ${t.title}`.slice(0, 60), `adt:${t._id}`).row());
  if (page > 0) kb.text('⬅️', `adls:${exam}:${section}:${page - 1}`);
  if (page + 1 < pages) kb.text('➡️', `adls:${exam}:${section}:${page + 1}`);
  kb.row().text('⬅️ Orqaga', `adl:${exam}`);
  return ctx.editMessageText(`📚 <b>${EXAM_NAMES[exam]} · ${SECTION_NAMES[section]}</b> — ${tests.length} ta test`, { parse_mode: 'HTML', reply_markup: kb });
}

async function testDetail(ctx, id) {
  const t = await Test.findById(id).lean();
  if (!t) return ctx.answerCallbackQuery({ text: 'Topilmadi' });
  await ctx.answerCallbackQuery();
  const [count, pending] = await Promise.all([
    Promise.all([Attempt.countDocuments({ test: t._id }), ScreenshotResult.countDocuments({ test: t._id, status: 'accepted' })]).then(a => a[0] + a[1]),
    Promise.all([Attempt.countDocuments({ test: t._id, status: { $ne: 'done' } }), ScreenshotResult.countDocuments({ test: t._id, needs_analysis: true })]).then(a => a[0] + a[1]),
  ]);
  const kb = new InlineKeyboard().text("👁 Materiallarni ko'rish", `adv:${t._id}`).row();
  if (t.section !== 'writing' && t.submission_mode !== 'screenshot') kb.text('🔑 Kalitni yangilash', `adk:${t._id}`).row();
  kb.text("🗑 O'chirish", `add:${t._id}`).row().text('⬅️ Orqaga', `adls:${t.exam}:${t.section}`);
  return ctx.editMessageText(
    `<b>${esc(t.title)}</b>\n${EXAM_NAMES[t.exam]} · ${SECTION_NAMES[t.section]} · №${t.order}\n` +
      `📎 Materiallar: ${t.materials.length}\n🔑 Savollar: ${t.answer_key.length || '—'}\n👥 Ishlaganlar: ${count} (tahlil/tekshiruv kutmoqda: ${pending})`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

/* ------------------------------ Writing baholash ------------------------------ */

async function showWritingQueue(ctx) {
  const list = await Attempt.find({ status: 'grading' }).sort({ createdAt: 1 }).limit(10).populate('user', 'full_name group_name').populate('test', 'title').lean();
  if (!list.length) return ctx.reply('✅ Tekshirilmagan Writing yo\'q.');
  for (const a of list) {
    await ctx.reply(`📝 <b>${esc(a.user?.full_name)}</b> (${esc(a.user?.group_name || '—')})\n${EXAM_NAMES[a.exam]} · ${esc(a.test?.title)}\n🕒 ${a.createdAt.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`, {
      parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('✍️ Baholash', `wg:${a._id}`),
    });
  }
  return null;
}

async function startGrading(ctx, id) {
  const a = await Attempt.findById(id).populate('user', 'full_name').populate('test', 'title max_score').lean();
  if (!a) return ctx.answerCallbackQuery({ text: 'Topilmadi' });
  if (a.status !== 'grading') return ctx.answerCallbackQuery({ text: 'Bu ish allaqachon baholangan', show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.reply(`📝 <b>${esc(a.user?.full_name)}</b> — ${esc(a.test?.title)}`, { parse_mode: 'HTML' });
  if (a.writing.kind === 'text') {
    const t = a.writing.text || '';
    for (let i = 0; i < t.length; i += 4000) await ctx.reply(t.slice(i, i + 4000));
  } else {
    await safeSend(() => sendMaterial(ctx.api, ctx.chat.id, a.writing));
  }
  setSession(ctx.from.id, { step: 'w_score', attemptId: String(a._id) });
  const hint = a.exam === 'ielts' ? 'IELTS band (0–9, masalan <code>6.5</code>)' : `CEFR ball (masalan <code>52</code> yoki <code>52/${a.max_score || 75}</code>)`;
  return ctx.reply(`Bahoni yozing: ${hint}`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('✖️ Bekor qilish', 'cancel') });
}

steps.w_score = async (ctx, s) => {
  const a = await Attempt.findById(s.attemptId).lean();
  if (!a || a.status !== 'grading') { clearSession(ctx.from.id); return ctx.reply('Bu ish allaqachon baholangan.'); }
  const sc = parseWritingScore(a.exam, ctx.message.text, a.max_score);
  if (!sc) return ctx.reply(a.exam === 'ielts' ? "Noto'g'ri. 0 dan 9 gacha, 0.5 qadam bilan (masalan 6.5)." : "Noto'g'ri. Masalan: 52 yoki 52/75.");
  setSession(ctx.from.id, { ...s, step: 'w_feedback', score: sc });
  return ctx.reply("Endi o'quvchiga izoh yozing (xatolari, tavsiyalar). O'quvchi shu izoh asosida tahlil qiladi:");
};

steps.w_feedback = async (ctx, s) => {
  const feedback = (ctx.message.text || '').trim();
  if (feedback.length < 5 || feedback.length > 1000) return ctx.reply('Izohni 5–1000 belgi bilan yozing.');
  const set = {
    status: 'analysis', score: s.score.score, max_score: s.score.max_score, percent: s.score.percent,
    feedback, graded_by: await actorUserId(ctx.from.id),
  };
  const a0 = await Attempt.findById(s.attemptId).select('exam').lean();
  if (a0?.exam === 'ielts') set.band = s.score.score;
  else set.level = cefrLevel(s.score.percent);
  const res = await Attempt.findOneAndUpdate({ _id: s.attemptId, status: 'grading' }, { $set: set }, { new: true }).populate('test', 'title').lean();
  clearSession(ctx.from.id);
  if (!res) return ctx.reply('Bu ish allaqachon baholangan.');
  await ctx.reply('✅ Baho saqlandi va o\'quvchiga yuborildi.');
  const link = await TgLink.findOne({ user: res.user }).lean();
  if (link) {
    const scoreText = res.exam === 'ielts' ? `Band: <b>${res.score}</b>` : `Ball: <b>${res.score}/${res.max_score}</b> (${res.level}, taxminiy)`;
    await safeSend(() => ctx.api.sendMessage(link.telegram_id,
      `📝 <b>Writing natijasi — ${esc(res.test?.title)}</b>\n${scoreText}\n\n💬 O'qituvchi izohi:\n<i>${esc(feedback)}</i>\n\n` +
        "❗ Keyingi Writing ochilishi uchun izoh asosida <b>tahlil yozishingiz shart</b>.",
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🧠 Tahlil qilish', `an:${res._id}`) }));
  }
  return null;
};

/* ------------------------------ guruhlar va to'lovlar ------------------------------ */

async function showGroups(ctx) {
  const groups = await GroupChat.find({ enabled: true }).lean();
  if (!groups.length) {
    return ctx.reply(
      "Hali guruh ulanmagan.\n\n1) Botni Telegram guruhga qo'shing (admin qiling).\n2) Guruhda yozing: <code>/ulash 1-guruh</code>\n" +
      "O‘quvchilar guruhdagi ro‘yxatdan o‘tish tugmasidan kiradi.",
      { parse_mode: 'HTML' }
    );
  }
  for (const g of groups) {
    const kb = new InlineKeyboard()
      .text('📋 Davomatni ochish', `gatt:${g._id}`).text('📤 Davomat → guruh', `as:${g._id}:${dateKey().replace(/-/g, '').slice(2)}`).row()
      .text("💵 To'lamaganlar", `paylist:${g._id}`).text("📤 To'lov → guruh", `payrep:${g._id}`);
    await ctx.reply(
      `👥 <b>${esc(g.title)}</b>\nGuruh: ${esc(g.group_name || g.title || '—')}\n` +
        `⏰ Davomat: ${g.attendance_time} (${g.days.map((d) => DAY_NAMES[d]).join(', ')})\n💰 To'lov sanasi: har oyning ${g.pay_day}-kuni, ${g.pay_time}`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }
  return ctx.reply(
    "Sozlash (guruhning o'zida yoziladi):\n<code>/davomat_vaqti 14:00</code>\n<code>/dars_kunlari 1,3,5</code> (1=Du … 7=Ya)\n" +
      "<code>/tolov_sanasi 5 10:00</code>\n<code>/sozlamalar</code> · <code>/uzish</code>",
    { parse_mode: 'HTML' }
  );
}

function register(bot) {
  bot.hears(BTN.addMaterial, adminOnly(ctx => ctx.reply('Material qaysi imtihon uchun?', { reply_markup: examKb('am:ex') })));
  bot.callbackQuery(/^am:ex:(ielts|cefr)$/, adminOnly(async ctx => {
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(`${EXAM_NAMES[ctx.match[1]]} — bo‘lim:`, { reply_markup: sectionKb('am:sec', ctx.match[1]) });
  }));
  bot.callbackQuery(/^am:sec:(ielts|cefr):(reading|listening|writing)$/, adminOnly(async ctx => {
    await ctx.answerCallbackQuery();
    setSession(ctx.from.id, { step: 't_title', exam: ctx.match[1], section: ctx.match[2], submissionMode: 'screenshot' });
    return ctx.editMessageText('Material nomini yozing (masalan: Cambridge 18 — Reading 1). Keyin HTML/PDF va audio fayllarni yuborasiz.');
  }));
  bot.hears(BTN.addTest, adminOnly((ctx) => ctx.reply('Qaysi imtihon uchun test qo\'shasiz?', { reply_markup: examKb('ad:ex') })));
  bot.callbackQuery(/^ad:ex:(ielts|cefr)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(`${EXAM_NAMES[ctx.match[1]]} — bo'lim:`, { reply_markup: sectionKb('ad:sec', ctx.match[1]) });
  }));
  bot.callbackQuery(/^ad:sec:(ielts|cefr):(reading|listening|writing)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setSession(ctx.from.id, { step: 't_title', exam: ctx.match[1], section: ctx.match[2] });
    return ctx.editMessageText(`${EXAM_NAMES[ctx.match[1]]} · ${SECTION_NAMES[ctx.match[2]]}\n\nTest nomini yozing (masalan: «Cambridge 18 Test 1»):`);
  }));
  bot.callbackQuery('ad:mdone', adminOnly(materialsDone));

  bot.hears(BTN.tests, adminOnly((ctx) => ctx.reply('Testlar:', { reply_markup: examKb('adl') })));
  bot.callbackQuery(/^adl:(ielts|cefr)$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(`${EXAM_NAMES[ctx.match[1]]} — bo'lim:`, { reply_markup: sectionKb('adls', ctx.match[1]) });
  }));
  bot.callbackQuery(/^adls:(ielts|cefr):(reading|listening|writing)(?::(\d{1,5}))?$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    return listTests(ctx, ctx.match[1], ctx.match[2], Number(ctx.match[3] || 0));
  }));
  bot.callbackQuery(/^adt:([a-f\d]{24})$/, adminOnly((ctx) => testDetail(ctx, ctx.match[1])));
  bot.callbackQuery(/^adv:([a-f\d]{24})$/, adminOnly(async (ctx) => {
    const t = await Test.findById(ctx.match[1]).lean();
    await ctx.answerCallbackQuery();
    if (!t) return null;
    for (const m of t.materials) await safeSend(() => sendMaterial(ctx.api, ctx.chat.id, m));
    if (t.answer_key.length) await ctx.reply(`🔑 ${t.answer_key.map((v, i) => `${i + 1}) ${v.join('/')}`).join('\n')}`);
    return null;
  }));
  bot.callbackQuery(/^adk:([a-f\d]{24})$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    setSession(ctx.from.id, { step: 't_key', editTestId: ctx.match[1] });
    return ctx.reply('Yangi javob kalitini yuboring (to\'liq):');
  }));
  bot.callbackQuery(/^add:([a-f\d]{24})$/, adminOnly(async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text("🗑 Ha, o'chirish", `addok:${ctx.match[1]}`).text("✖️ Yo'q", `adt:${ctx.match[1]}`) });
  }));
  bot.callbackQuery(/^addok:([a-f\d]{24})$/, adminOnly(async (ctx) => {
    // Natijalar saqlanib qoladi (grafik buzilmasin); test o'quvchilarga ko'rinmaydi
    await Test.updateOne({ _id: ctx.match[1] }, { $set: { active: false } });
    await ctx.answerCallbackQuery({ text: "O'chirildi" });
    return ctx.editMessageText("🗑 Test o'chirildi. Uning natijalari statistikada saqlanib qoladi.");
  }));

  bot.hears(BTN.writing, adminOnly(showWritingQueue));
  bot.callbackQuery(/^wg:([a-f\d]{24})$/, adminOnly((ctx) => startGrading(ctx, ctx.match[1])));

  bot.hears(BTN.groups, adminOnly(showGroups));
  bot.callbackQuery(/^gatt:([a-f\d]{24})$/, adminOnly(async (ctx) => {
    const g = await GroupChat.findById(ctx.match[1]).lean();
    await ctx.answerCallbackQuery();
    if (g) await attendance.sendSheetToAdmins(ctx.api, g);
    return null;
  }));
  bot.hears(BTN.payments, adminOnly(async (ctx) => {
    const groups = await GroupChat.find({ enabled: true }).lean();
    if (!groups.length) return ctx.reply('Hali guruh ulanmagan. «👥 Guruhlar» bo\'limiga qarang.');
    const kb = new InlineKeyboard();
    groups.forEach((g) => kb.text(g.title || g.group_name || String(g.chat_id), `paylist:${g._id}`).row());
    return ctx.reply("Qaysi guruh to'lovlari?", { reply_markup: kb });
  }));

  // Admin uchun: ilovadagi o'quvchilar soni (tezkor tekshiruv)
  bot.command('statistika', adminOnly(async (ctx) => {
    const [students, tests, pending] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Test.countDocuments({ active: true }),
      Attempt.countDocuments({ status: 'grading' }),
    ]);
    return ctx.reply(`👥 O'quvchilar: ${students}\n📚 Faol testlar: ${tests}\n📝 Tekshirilmagan Writing: ${pending}`);
  }));
}

module.exports = { register, adminOnly, DAY_NAMES };
