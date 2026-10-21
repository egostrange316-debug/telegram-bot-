const { randomUUID } = require('crypto');
const { consumeLinkCode, linkAccount } = require('../lib/linking');
const { allowLogin } = require('../lib/login-limit');
const bcrypt = require('bcryptjs');
const { InlineKeyboard, InputFile } = require('grammy');
const config = require('../config');
const { User } = require('../models/app');
const { TgLink, Test, Attempt } = require('../models/bot');
const { parseAnswers, grade, ieltsBand, cefrLevel } = require('../lib/grading');
const { userResults, leaderboard, chartConfig, SECTION_NAMES, EXAM_NAMES, TREND_TEXT } = require('../lib/stats');
const { sectionState, canStart, STATE_ICON } = require('./tests');
const {
  getSession, setSession, clearSession, steps, esc, linkedUser, isAdmin, adminChatIds,
  BTN, sendMenu, sendMaterial, materialFromMessage, safeSend,
} = require('./common');

const cancelKb = new InlineKeyboard().text('✖️ Bekor qilish', 'cancel');

/* ------------------------------ kirish ------------------------------ */

async function start(ctx) {
  if (ctx.chat.type !== 'private') return;
  if (String(ctx.match || '').startsWith('link_')) {
    const code = await consumeLinkCode(ctx.match.slice(5));
    if (!code || !(await User.exists({ _id: code.user }))) return ctx.reply('Ulash havolasi eskirgan. Ilovadan yangisini oling.');
    await linkAccount(ctx.from.id, code.user, ctx.from.username);
    clearSession(ctx.from.id);
    return sendMenu(ctx, '✅ Ilova akkauntingiz botga ulandi.');
  }
  if (getSession(ctx.from.id)) {
    return ctx.reply('Boshlangan ish saqlangan. Oxirgi so‘ralgan matn yoki faylni yuborib davom eting. Bekor qilish: /cancel');
  }
  const user = await linkedUser(ctx.from.id);
  if (user) return sendMenu(ctx, `Assalomu alaykum, <b>${esc(user.full_name)}</b>! 👋`);
  if (await isAdmin(ctx.from.id)) {
    return sendMenu(ctx, "Assalomu alaykum, admin! 👋\nIlova akkauntingiz bilan ham kirmoqchi bo'lsangiz: /login");
  }
  return askLogin(ctx);
}

async function askLogin(ctx) {
  if (ctx.chat.type !== 'private') return;
  setSession(ctx.from.id, { step: 'login_name' });
  return ctx.reply(
    "Assalomu alaykum! 👋\nBu — o'quv markazimizning IELTS va CEFR boti.\n\n" +
      "Kirish uchun <b>ilovadagi ism-familiyangizni</b> yozing (ilovaga qanday kirsangiz, xuddi shunday):",
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
  );
}

steps.login_name = async (ctx, s) => {
  const name = ctx.message.text;
  if (!name) return ctx.reply('Ism-familiyani matn bilan yozing.');
  setSession(ctx.from.id, { ...s, step: 'login_password', name });
  return ctx.reply('Endi ilovadagi parolingizni yozing (xabar darhol o\'chiriladi):');
};

steps.login_password = async (ctx, s) => {
  const password = ctx.message.text || '';
  await ctx.deleteMessage().catch(() => {});
  if (!allowLogin(ctx.from.id, User.nameKey(s.name))) return ctx.reply('Ko‘p urinish bo‘ldi. 15 daqiqadan keyin qayta urinib ko‘ring yoki ilovadagi «Telegramga ulash»dan foydalaning.');
  const user = await User.findOne({ name_key: User.nameKey(s.name) }).lean();
  const ok = user && user.password_hash && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    setSession(ctx.from.id, { step: 'login_name' });
    return ctx.reply("❌ Ism yoki parol noto'g'ri. Ism-familiyangizni qaytadan yozing:");
  }
  await linkAccount(ctx.from.id, user._id, ctx.from.username);
  clearSession(ctx.from.id);
  return sendMenu(ctx, `✅ Xush kelibsiz, <b>${esc(user.full_name)}</b>!`);
};

async function logout(ctx) {
  await TgLink.deleteOne({ telegram_id: ctx.from.id });
  clearSession(ctx.from.id);
  return ctx.reply('Siz chiqdingiz. Qayta kirish uchun /start', { reply_markup: { remove_keyboard: true } });
}

/** O'quvchi talab qilinadigan joylarda: bog'lanmagan bo'lsa kirishga yo'naltiradi */
async function requireStudent(ctx) {
  const user = await linkedUser(ctx.from.id);
  if (!user) {
    await ctx.reply('Avval kiring: /start');
    return null;
  }
  return user;
}

/* ------------------------------ bo'limlar va testlar ------------------------------ */

function sectionsKb(exam) {
  return new InlineKeyboard()
    .text('📖 Reading', `sec:${exam}:reading`).row()
    .text('🎧 Listening', `sec:${exam}:listening`).row()
    .text('✍️ Writing', `sec:${exam}:writing`);
}

async function showExam(ctx, exam) {
  if (!(await requireStudent(ctx))) return;
  return ctx.reply(`<b>${EXAM_NAMES[exam]}</b> — bo'limni tanlang:`, { parse_mode: 'HTML', reply_markup: sectionsKb(exam) });
}

async function showSection(ctx, exam, section, asNew = false, requestedPage = 0) {
  const user = await requireStudent(ctx);
  if (!user) return;
  const out = (text, other) => (asNew ? ctx.reply(text, other) : ctx.editMessageText(text, other));
  const { rows, pending } = await sectionState(user._id, exam, section);
  const title = `<b>${EXAM_NAMES[exam]} · ${SECTION_NAMES[section]}</b>`;
  if (!rows.length) return out(`${title}\n\nHozircha test joylanmagan.`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Orqaga', `ex:${exam}`) });
  const kb = new InlineKeyboard();
  if (pending?.status === 'analysis') kb.text('🧠 Tugallanmagan tahlil', `an:${pending._id}`).row();
  const pages = Math.max(1, Math.ceil(rows.length / 40));
  const page = Math.min(Math.max(0, requestedPage), pages - 1);
  rows.slice(page * 40, (page + 1) * 40).forEach((r, i) => kb.text(`${STATE_ICON[r.state]} ${page * 40 + i + 1}. ${r.test.title}`.slice(0, 60), `t:${r.test._id}`).row());
  if (page > 0) kb.text('⬅️', `sp:${exam}:${section}:${page - 1}`);
  if (page + 1 < pages) kb.text('➡️', `sp:${exam}:${section}:${page + 1}`);
  kb.row().text('⬅️ Orqaga', `ex:${exam}`);
  const legend = '✅ ishlangan · 🔓 ochiq · 🧠 tahlil kerak · ⏳ tekshirilmoqda · 🔒 yopiq';
  return out(`${title}\n\n${legend}`, { parse_mode: 'HTML', reply_markup: kb });
}

async function showTest(ctx, testId) {
  const user = await requireStudent(ctx);
  if (!user) return;
  const test = await Test.findById(testId).lean();
  if (!test || !test.active) return ctx.answerCallbackQuery({ text: 'Test topilmadi', show_alert: true });
  const { rows, pending } = await sectionState(user._id, test.exam, test.section);
  const row = rows.find((r) => String(r.test._id) === String(testId));
  if (!row) return ctx.answerCallbackQuery({ text: 'Test topilmadi', show_alert: true });

  if (row.state === 'locked') {
    return ctx.answerCallbackQuery({ text: "🔒 Bu test hali yopiq. Oldingi testni ishlab, uni TAHLIL qiling — shundan so'ng ochiladi.", show_alert: true });
  }
  if (row.state === 'grading') {
    return ctx.answerCallbackQuery({ text: '⏳ Writing ishingiz o\'qituvchi tekshiruvida. Baho chiqqach xabar beramiz.', show_alert: true });
  }
  if (row.state === 'analysis') {
    await ctx.answerCallbackQuery();
    return beginAnalysis(ctx, row.pendingAttemptId);
  }

  await ctx.answerCallbackQuery();
  const info = test.section === 'writing'
    ? 'Topshiriqni o\'qing va inshoingizni yuboring.'
    : `Savollar soni: <b>${test.answer_key.length}</b>`;
  const kb = new InlineKeyboard().text(row.state === 'done' ? '🔁 Qayta ishlash' : '▶️ Boshlash', `st:${test._id}`).row().text('⬅️ Orqaga', `sec:${test.exam}:${test.section}`);
  return ctx.editMessageText(`<b>${esc(test.title)}</b>\n${EXAM_NAMES[test.exam]} · ${SECTION_NAMES[test.section]}\n\n${info}`, { parse_mode: 'HTML', reply_markup: kb });
}

async function startTest(ctx, testId) {
  const user = await requireStudent(ctx);
  if (!user) return;
  const test = await Test.findById(testId).lean();
  if (!test || !test.active) return ctx.answerCallbackQuery({ text: 'Test topilmadi', show_alert: true });
  const { rows, pending } = await sectionState(user._id, test.exam, test.section);
  const row = rows.find((r) => String(r.test._id) === String(testId));
  if (!row || !['open', 'done'].includes(row.state)) {
    return ctx.answerCallbackQuery({ text: '🔒 Bu testni hozir boshlab bo\'lmaydi.', show_alert: true });
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(`📝 <b>${esc(test.title)}</b> boshlandi. Materiallar:`, { parse_mode: 'HTML' });
  for (const m of test.materials) await sendMaterial(ctx.api, ctx.chat.id, m);

  setSession(ctx.from.id, { step: test.section === 'writing' ? 'writing' : 'answers', testId: String(test._id), submissionId: randomUUID() });
  if (test.section === 'writing') {
    return ctx.reply('✍️ Inshoingizni <b>matn</b> qilib yoki <b>rasm/fayl</b> ko\'rinishida yuboring.', { parse_mode: 'HTML', reply_markup: cancelKb });
  }
  return ctx.reply(
    `✍️ Javoblaringizni <b>bitta xabarda</b> yuboring (${test.answer_key.length} ta savol).\n\n` +
      'Masalan:\n<code>1-A 2-C 3-true 4-not given</code>\nyoki har qatorda bittadan javob.',
    { parse_mode: 'HTML', reply_markup: cancelKb }
  );
}

steps.answers = async (ctx, s) => {
  const text = ctx.message.text;
  if (!text) return ctx.reply('Javoblarni matn ko\'rinishida yuboring.');
  const test = await Test.findById(s.testId).lean();
  if (!test?.active) { clearSession(ctx.from.id); return ctx.reply('Test topilmadi.'); }
  const answers = parseAnswers(text);
  if (answers.length > test.answer_key.length) return ctx.reply('Javoblar soni test savollaridan ko‘p. Raqamlarni tekshiring.');
  const filled = answers.filter(Boolean).length;
  if (!filled) return ctx.reply("Javob topilmadi. Masalan: <code>1-A 2-B 3-C</code>", { parse_mode: 'HTML' });
  setSession(ctx.from.id, { ...s, step: 'answers_confirm', answers });
  const preview = answers.map((a, i) => `${i + 1}) ${(a || '—').slice(0, 50)}`).join('\n').slice(0, 1800);
  const warn = filled < test.answer_key.length ? `\n\n⚠️ ${test.answer_key.length - filled} ta savolga javob yo'q — ular xato hisoblanadi.` : '';
  return ctx.reply(`Javoblaringiz:\n<pre>${esc(preview)}</pre>${warn}\n\nTekshirilsinmi?`, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text('✅ Ha, tekshir', 'ans:ok').text('✏️ Qayta yozaman', 'ans:redo'),
  });
};

// Tasdiqlash o'rniga yangi javoblar yozilsa — qayta qabul qilamiz
steps.answers_confirm = (ctx, s) => steps.answers(ctx, s);

async function submitAnswers(ctx) {
  const s = getSession(ctx.from.id);
  if (!s || s.step !== 'answers_confirm') return ctx.answerCallbackQuery({ text: 'Eskirgan tugma' });
  const user = await linkedUser(ctx.from.id);
  const test = await Test.findById(s.testId).lean();
  if (!user || !test) { clearSession(ctx.from.id); return ctx.answerCallbackQuery({ text: 'Test topilmadi' }); }
  if (!(await canStart(user._id, test))) {
    clearSession(ctx.from.id);
    return ctx.answerCallbackQuery({ text: 'Avval oldingi test tahlilini tugating.', show_alert: true });
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup().catch(() => {});

  const r = grade(test.answer_key, s.answers);
  const doc = {
    user: user._id, test: test._id, exam: test.exam, section: test.section,
    status: 'analysis', pending: true, submission_id: s.submissionId || randomUUID(),
    correct: r.correct, total: r.total, percent: r.percent, answers: s.answers, mistakes: r.mistakes,
  };
  if (test.exam === 'ielts') doc.band = ieltsBand(test.section, r.correct, r.total);
  else doc.level = cefrLevel(r.percent);
  const attempt = await Attempt.create(doc);
  clearSession(ctx.from.id);

  const scoreLine = test.exam === 'ielts' ? `Band (taxminiy): <b>${doc.band}</b>` : `Daraja (taxminiy): <b>${doc.level}</b>`;
  await ctx.reply(
    `📊 <b>Natija: ${r.correct}/${r.total}</b> (${r.percent}%)\n${scoreLine}\n\n` +
      (r.mistakes.length
        ? `❗ Sizda <b>${r.mistakes.length} ta xato</b>. Keyingi test ochilishi uchun har bir xatoni <b>tahlil qilishingiz shart</b>.`
        : '🎉 Xatosiz! Keyingi test uchun qisqa yakuniy tahlil yozing.'),
    { parse_mode: 'HTML' }
  );
  return beginAnalysis(ctx, String(attempt._id));
}

/* ------------------------------ Writing topshirish ------------------------------ */

steps.writing = async (ctx, s) => {
  const m = materialFromMessage(ctx.message);
  if (!m || !['text', 'photo', 'document'].includes(m.kind)) return ctx.reply('Inshoni matn, rasm yoki fayl qilib yuboring.');
  if (m.kind === 'text' && m.text.trim().length < 50) return ctx.reply('Insho juda qisqa. To\'liq matnni yuboring.');
  const user = await linkedUser(ctx.from.id);
  const test = await Test.findById(s.testId).lean();
  if (!user || !test) { clearSession(ctx.from.id); return ctx.reply('Test topilmadi.'); }
  if (!(await canStart(user._id, test))) {
    clearSession(ctx.from.id);
    return ctx.reply('Avval oldingi test tahlilini tugating.');
  }
  const attempt = await Attempt.create({
    user: user._id, test: test._id, exam: test.exam, section: 'writing', status: 'grading', pending: true, submission_id: s.submissionId || randomUUID(),
    max_score: test.max_score, writing: { kind: m.kind, text: m.text, file_id: m.file_id },
  });
  clearSession(ctx.from.id);
  await ctx.reply("✅ Inshoingiz qabul qilindi va o'qituvchiga yuborildi. Baho chiqqach xabar beramiz.");
  const admins = await adminChatIds();
  for (const id of admins) {
    await safeSend(() => ctx.api.sendMessage(id,
      `📝 Yangi Writing: <b>${esc(user.full_name)}</b> (${esc(user.group_name || '—')})\n${EXAM_NAMES[test.exam]} · ${esc(test.title)}`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('✍️ Baholash', `wg:${attempt._id}`) }));
  }
  return null;
};

/* ------------------------------ tahlil (majburiy) ------------------------------ */

async function beginAnalysis(ctx, attemptId) {
  const user = await linkedUser(ctx.from.id);
  const a = await Attempt.findById(attemptId).populate('test', 'title').lean();
  if (!user || !a || String(a.user) !== String(user._id)) return ctx.reply('Tahlil topilmadi.');
  if (a.status === 'done') return ctx.reply('✅ Bu test tahlil qilingan.');
  if (a.status !== 'analysis') return ctx.reply('⏳ Bu ish hali tekshirilmoqda.');
  if (a.section !== 'writing' && a.mistakes.length && a.mistakes.every((m) => m.analysis)) {
    await Attempt.updateOne({ _id: a._id, status: 'analysis' }, { $set: { status: 'done', pending: false, finished_at: new Date() } });
    return ctx.reply('✅ Bu test tahlil qilingan. Keyingi test ochiq 🔓');
  }
  setSession(ctx.from.id, { step: 'analysis', attemptId: String(a._id) });
  return askNextAnalysis(ctx, a);
}

async function askNextAnalysis(ctx, a) {
  if (a.section !== 'writing' && !a.mistakes.length) {
    return ctx.reply(`🧠 Xatosiz test tahlili: qaysi savol qiyin bo‘ldi, javobni qanday topdingiz va nimani o‘rgandingiz? Kamida ${config.MIN_ANALYSIS_CHARS} belgi yozing.`);
  }
  if (a.section === 'writing') {
    return ctx.reply(
      `🧠 <b>Tahlil — ${esc(a.test?.title || 'Writing')}</b>\n\nO'qituvchi izohi:\n<i>${esc(a.feedback || '—')}</i>\n\n` +
        `Izohni o'qib, <b>qanday xatolar qilganingizni va keyingi safar nimani o'zgartirishingizni</b> yozing (kamida ${config.MIN_ANALYSIS_CHARS} belgi):`,
      { parse_mode: 'HTML' }
    );
  }
  const idx = a.mistakes.findIndex((m) => !m.analysis);
  const m = a.mistakes[idx];
  return ctx.reply(
    `🧠 <b>Tahlil ${idx + 1}/${a.mistakes.length}</b>\n\n` +
      `<b>${m.q}-savol</b>\nSizning javobingiz: <b>${esc(m.given || '—')}</b>\nTo'g'ri javob: <b>${esc(m.correct)}</b>\n\n` +
      `Nega xato qildingiz? Javob matn/audioning qayerida edi? O'z so'zingiz bilan yozing (kamida ${config.MIN_ANALYSIS_CHARS} belgi):`,
    { parse_mode: 'HTML' }
  );
}

steps.analysis = async (ctx, s) => {
  const text = (ctx.message.text || '').trim();
  if (text.length < config.MIN_ANALYSIS_CHARS) {
    return ctx.reply(`Tahlil juda qisqa — kamida ${config.MIN_ANALYSIS_CHARS} belgi yozing. Xatoingizni chin dildan tahlil qiling 🙂`);
  }
  const a = await Attempt.findById(s.attemptId).populate('test', 'title').lean();
  const user = await linkedUser(ctx.from.id);
  if (!user || !a || String(a.user) !== String(user._id) || a.status !== 'analysis') { clearSession(ctx.from.id); return ctx.reply('Tahlil topilmadi.'); }

  if (a.section === 'writing' || !a.mistakes.length) {
    await Attempt.updateOne({ _id: a._id, status: 'analysis' }, { $set: { analysis: text, status: 'done', pending: false, finished_at: new Date() } });
  } else {
    const idx = a.mistakes.findIndex((m) => !m.analysis);
    if (idx !== -1) {
      await Attempt.updateOne({ _id: a._id }, { $set: { [`mistakes.${idx}.analysis`]: text } });
      a.mistakes[idx].analysis = text;
      if (a.mistakes.some((m) => !m.analysis)) return askNextAnalysis(ctx, a);
    }
    await Attempt.updateOne({ _id: a._id, status: 'analysis' }, { $set: { status: 'done', pending: false, finished_at: new Date() } });
  }
  clearSession(ctx.from.id);
  return ctx.reply('✅ Tahlil yakunlandi! Barakalla. Keyingi test ochildi 🔓', {
    reply_markup: new InlineKeyboard().text("➡️ Bo'limga qaytish", `secn:${a.exam}:${a.section}`),
  });
};

/* ------------------------------ natijalar va reyting ------------------------------ */

async function renderChart(result) {
  if (!config.CHART_URL || result.items.length < 2) return null;
  const last = { ...result, items: result.items.slice(-30) };
  try {
    const res = await fetch(config.CHART_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chart: chartConfig(last), width: 700, height: 380, backgroundColor: 'white', format: 'png', version: '4' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error('Grafik xatosi:', e.message);
    return null;
  }
}

async function showResults(ctx, exam) {
  const user = await requireStudent(ctx);
  if (!user) return;
  const r = await userResults(user._id, exam);
  if (!r.items.length) return ctx.reply(`${EXAM_NAMES[exam]} bo'yicha hali baholangan natija yo'q.`);
  const lines = [`📊 <b>${EXAM_NAMES[exam]} — natijalaringiz</b>`, ''];
  for (const [s, v] of Object.entries(r.sections)) {
    if (!v.count) continue;
    const extra = exam === 'ielts' ? `, o'rtacha band ${v.average_band}` : '';
    lines.push(`<b>${SECTION_NAMES[s]}</b>: ${v.count} ta test, o'rtacha ${v.average_percent}%${extra} ${v.trend.direction ? TREND_TEXT[v.trend.direction] : ''}`);
  }
  lines.push('', `Umumiy o'rtacha: <b>${r.average_percent}%</b>`);
  if (r.trend.direction) lines.push(`${TREND_TEXT[r.trend.direction]} (${r.trend.diff > 0 ? '+' : ''}${r.trend.diff}%)`);
  lines.push('', '<b>Oxirgi natijalar:</b>');
  for (const it of r.items.slice(-8).reverse()) {
    const sc = exam === 'ielts' ? `band ${it.band}` : it.level || '';
    lines.push(`• ${new Date(it.date).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' })} · ${SECTION_NAMES[it.section]} · ${esc(it.title)} — ${it.percent}% (${sc})`);
  }
  const text = lines.join('\n');
  const png = await renderChart(r);
  if (png && text.length <= 1024) return ctx.replyWithPhoto(new InputFile(png, 'grafik.png'), { caption: text, parse_mode: 'HTML' });
  if (png) await ctx.replyWithPhoto(new InputFile(png, 'grafik.png'));
  return ctx.reply(text, { parse_mode: 'HTML' });
}

async function showRating(ctx, exam) {
  const user = await requireStudent(ctx);
  if (!user) return;
  const board = await leaderboard(exam);
  if (!board.length) return ctx.reply(`${EXAM_NAMES[exam]} bo'yicha reyting hali bo'sh.`);
  const medal = ['🥇', '🥈', '🥉'];
  const lines = [`🏆 <b>${EXAM_NAMES[exam]} — o'quv markaz reytingi</b>`, ''];
  for (const b of board.slice(0, 15)) {
    const band = exam === 'ielts' && b.average_band != null ? ` · band ${b.average_band}` : '';
    const me = b.user_id === String(user._id) ? ' 👈' : '';
    lines.push(`${medal[b.place - 1] || `${b.place}.`} ${esc(b.full_name)} (${esc(b.group_name || '—')}) — ${b.average_percent}%${band}, ${b.tests} test${me}`);
  }
  const mine = board.find((b) => b.user_id === String(user._id));
  if (mine && mine.place > 15) lines.push('…', `${mine.place}. ${esc(mine.full_name)} — ${mine.average_percent}% 👈`);
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

const examPickKb = (prefix) => new InlineKeyboard().text('🇬🇧 IELTS', `${prefix}:ielts`).text('🇪🇺 CEFR', `${prefix}:cefr`);

function register(bot) {
  bot.command('start', start);
  bot.command('login', askLogin);
  bot.command('tahlil', async (ctx) => {
    const user = await requireStudent(ctx);
    if (!user) return null;
    const pending = await Attempt.findOne({ user: user._id, status: { $in: ['analysis', 'grading'] } }).sort({ createdAt: 1 }).lean();
    if (!pending) return ctx.reply('✅ Tugallanmagan tahlil yo‘q.');
    return beginAnalysis(ctx, String(pending._id));
  });
  bot.command('menu', (ctx) => ctx.chat.type === 'private' && sendMenu(ctx));
  bot.hears(BTN.logout, logout);
  bot.hears(BTN.ielts, (ctx) => showExam(ctx, 'ielts'));
  bot.hears(BTN.cefr, (ctx) => showExam(ctx, 'cefr'));
  bot.hears(BTN.results, (ctx) => ctx.reply("Qaysi bo'lim natijalari?", { reply_markup: examPickKb('res') }));
  bot.hears(BTN.rating, (ctx) => ctx.reply('Qaysi reyting?', { reply_markup: examPickKb('rat') }));

  bot.callbackQuery(/^ex:(ielts|cefr)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const exam = ctx.match[1];
    return ctx.editMessageText(`<b>${EXAM_NAMES[exam]}</b> — bo'limni tanlang:`, { parse_mode: 'HTML', reply_markup: sectionsKb(exam) });
  });
  bot.callbackQuery(/^sec:(ielts|cefr):(reading|listening|writing)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return showSection(ctx, ctx.match[1], ctx.match[2]);
  });
  // Tahlildan keyin yangi xabar sifatida bo'lim ro'yxati
  bot.callbackQuery(/^secn:(ielts|cefr):(reading|listening|writing)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return showSection(ctx, ctx.match[1], ctx.match[2], true);
  });
  bot.callbackQuery(/^sp:(ielts|cefr):(reading|listening|writing):(\d{1,5})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return showSection(ctx, ctx.match[1], ctx.match[2], false, Number(ctx.match[3]));
  });
  bot.callbackQuery(/^t:([a-f\d]{24})$/, (ctx) => showTest(ctx, ctx.match[1]));
  bot.callbackQuery(/^st:([a-f\d]{24})$/, (ctx) => startTest(ctx, ctx.match[1]));
  bot.callbackQuery('ans:ok', submitAnswers);
  bot.callbackQuery('ans:redo', async (ctx) => {
    const s = getSession(ctx.from.id);
    if (s && s.step === 'answers_confirm') setSession(ctx.from.id, { ...s, step: 'answers' });
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
    return ctx.reply('Javoblaringizni qaytadan yuboring:');
  });
  bot.callbackQuery(/^an:([a-f\d]{24})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return beginAnalysis(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^res:(ielts|cefr)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return showResults(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^rat:(ielts|cefr)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return showRating(ctx, ctx.match[1]);
  });
}

module.exports = { register, beginAnalysis };
