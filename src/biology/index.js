const { Bot, Keyboard, InlineKeyboard } = require('grammy');
const { randomBytes } = require('crypto');
const config = require('../config');
const { BioProfile: Profile, BioGroup: Group, BioMock: Mock, BioSubmission: Submission } = require('../storage/postgres');
const { persistentSession, getSession, setSession, clearSession, materialFromMessage, sendMaterial } = require('../bot/common');
const { sendReport, messageChunks } = require('../lib/delivery');
const { InputError, esc, parseAnswers, answerText, localTime, parseLocal, isMember } = require('./domain');
const service = require('./service');
const { readSheet } = require('./answer-reader');
const { C, registerImportUI, registerQuizUI } = require('./import-ui');
const catalog = require('./catalog');
const {windowFor,isOpen,releaseAt}=require('./timing');
const B = { mocks: '🧬 Mocklar', answer: '📝 Javob topshirish', results: '📊 Natijalarim', rank: '🏆 Reyting', help: 'ℹ️ Yordam',
  create: '➕ Mock yaratish', bank: '📚 Mocklar navbati', groups: '⚙️ Guruh sozlamalari', student: '🎓 O‘quvchi rejimi', admin: '🛠 Admin rejimi', done: '✅ Fayllar tayyor' };
const commands = [ ['start', 'Boshlash'], ['menu', 'Asosiy menyu'], ['mock', 'Mocklar'], ['javob', 'Mock javoblarini topshirish'],
  ['qatnashaman', 'Guruh mocklariga yozilish'], ['natijalar', 'Natijalarim'], ['id', 'Telegram ID'], ['cancel', 'Bekor qilish'] ].map(([command, description]) => ({ command, description }));
const days = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
function keyboard(p, id) {
  const kb = new Keyboard();
  if (service.isOwner(id) && p.mode === 'admin') kb.text(C.upload).text(C.all).row().text(C.rename).row().text(C.edit).text(C.remove).row().text(C.send).text(C.key).row().text(C.results).text(C.rank).row().text(C.retake).row().text(B.create).text(B.bank).row().text(B.groups).row().text(B.student);
  else {
    kb.text(B.mocks).text(B.answer).row().text(B.results).text(B.rank).row().text(B.help);
    if (service.isOwner(id)) kb.row().text(B.admin);
  }
  return kb.resized();
}
async function menu(ctx, text = '🧬 Biologiya mock botiga xush kelibsiz!') {
  const p = await service.profile(ctx.from);
  return ctx.reply(text, { reply_markup: keyboard(p, ctx.from.id) });
}
async function admin(ctx) {
  if (ctx.chat?.type !== 'private' || !service.isOwner(ctx.from.id) || (await service.profile(ctx.from)).mode !== 'admin') throw new InputError('Bu amal faqat egasining admin rejimida ishlaydi.');
}
const imageFile = msg => msg?.photo?.at(-1) || (/^image\/(png|jpeg|webp)$/.test(msg?.document?.mime_type || '') ? msg.document : null);
async function aiAnswers(ctx, file, count, key, reader) {
  const p = await service.profile(ctx.from);
  const day = localTime(new Date()).slice(0, 10);
  const used = p.ai_day === day ? p.ai_count || 0 : 0;
  if (used >= 15) throw new InputError('Bugungi 15 ta rasm o‘qish limiti tugadi. Javoblarni matn bilan yuboring.');
  await Profile.updateOne({ telegram_id: ctx.from.id }, { $set: { ai_day: day, ai_count: used + 1 } });
  return reader(ctx.api, file, count, key);
}
async function listMocks(ctx, groupId) {
  const p = await service.profile(ctx.from);
  const groups = await Group.find({ _id: { $in: typeof groupId === 'string' ? p.group_ids.filter(id => id === groupId) : p.group_ids }, enabled: true });
  const mocks = await Mock.find({ group_id: { $in: groups.map(g => g._id) }, kind:{$ne:'room'}, $or:[{status:'daily'},{status:{$in:['scheduled','opening','open']},ends_at:{$gt:new Date()}}] }).sort({ starts_at: 1 }).limit(30);
  if (!mocks.length) return ctx.reply('Hozir ochiq mock yo‘q. Guruhdagi «Qatnashaman» tugmasi orqali ro‘yxatdan o‘ting.');
  const kb = new InlineKeyboard();
  for (const m of mocks) kb.text(`${isOpen(m) ? '🟢' : '🕒'} ${m.title.slice(0, 35)} · ${m.count}`, `bm:${m.code}`).row();
  return ctx.reply('Mockni tanlang:', { reply_markup: kb });
}
async function enrollForMock(ctx, code) {
  let m = await Mock.findOne({ code });
  if (!m || m.room_id || !['daily','scheduled', 'opening', 'open'].includes(m.status) || m.status!=='daily'&&new Date(m.ends_at) <= new Date()) throw new InputError('Bu mock ochiq emas yoki muddati tugagan.');
  m={...m,...windowFor(m)};
  const group = await Group.findById(m.group_id);
  if (ctx.chat.type !== 'private' && group?.chat_id !== ctx.chat.id) throw new InputError('Guruh mos kelmadi.');
  await service.enroll(ctx.api, ctx.from, group);
  return {...m,...windowFor(m)};
}
async function joinGroup(ctx, id) {
  const group = await Group.findById(id);
  await service.enroll(ctx.api, ctx.from, group);
  const active = await Mock.find({ group_id:id,kind:{$ne:'room'},$or:[{status:'daily'},{status:'open',starts_at:{$lte:new Date()},ends_at:{$gt:new Date()}}]}).limit(2);
  if (active.length === 1) return selectMock(ctx, active[0].code);
  if (active.length > 1) return listMocks(ctx, id);
  const upcoming = await Mock.find({ group_id: id, status: { $in: ['scheduled', 'opening'] }, ends_at: { $gt: new Date() } }).sort({ starts_at: 1 }).limit(1);
  if (upcoming.length) return selectMock(ctx, upcoming[0].code);
  return menu(ctx, '✅ Qatnashchilar ro‘yxatiga qo‘shildingiz. Yangi MOCK boshlanganda guruhga xabar keladi.');
}
async function selectMock(ctx, code) {
  const completed = await Mock.findOne({ code });
  const saved=completed&&await Submission.findOne({mock_id:completed._id,telegram_id:ctx.from.id});
  const retake=saved&&await require('../storage/postgres').BioAttempt.findOne({mock_id:completed._id,telegram_id:ctx.from.id,$or:[{retake_allowed:true},{state:'active'}]});
  if(saved&&!retake){if(catalog.reviewReady(completed,Date.now(),saved))return showReview(ctx,code);return ctx.reply(`✅ Javoblaringiz saqlangan. Natija ${localTime(releaseAt(completed,saved))} da ochiladi.`);}
  const m = await enrollForMock(ctx, code);
  clearSession(ctx.from.id);
  if (!isOpen(m)) {
    if(m.status==='daily')return ctx.reply(`🧬 ${m.title}\nMOCKlar har kuni 07:00–22:00 ochiq. Natijalar 22:10 da. (Toshkent)`);
    return ctx.reply(`✅ Qatnashchilar ro‘yxatiga qo‘shildingiz.\n\n🧬 ${m.title}\n🕒 Boshlanish: ${localTime(m.starts_at)} (Toshkent).\nTest hali boshlanmagan. Vaqti kelganda quyidagi tugmani bosing.`, {
      reply_markup: new InlineKeyboard().text('🔄 Testni ochish', `bm:${m.code}`),
    });
  }
  if (m.questions) {
    const kb = new InlineKeyboard();
    if (config.MINIAPP_URL) {
      const url = new URL(config.MINIAPP_URL); url.searchParams.set('run', m._id);
      kb.webApp('🧬 Testni boshlash', url.toString()).row();
    }
    kb.text('🧩 Botda ishlash', `bs:${m._id}`);
    setSession(ctx.from.id, { step: 'bio_answer', data: { mock_id: m._id } });
    return ctx.reply(`✅ Qatnashchilar ro‘yxatiga qo‘shildingiz.\n\n🧬 ${m.title} · ${m.count} savol\n🕒 Tugash: ${localTime(m.ends_at)} (Toshkent).\n\n${config.MINIAPP_URL ? '«Testni boshlash»ni bosing — ilovada aynan shu MOCK ochiladi.' : '«Botda ishlash» tugmasini bosing.'}`, {reply_markup:kb});
  }
  service.accepted(await service.begin(m,ctx.from));
  setSession(ctx.from.id, { step: 'bio_answer', data: { mock_id: m._id } });
  return ctx.reply(`📝 ${m.title} · #${m.code}\n${m.count} javobni raqamlab yuboring: 1A 2B 3C … yoki javob varaqasining rasmini yuboring.\nBo‘sh javob: -. Oxirgi muddat: ${localTime(m.ends_at)} (Toshkent).\nNatija va tahlil 22:10 da ochiladi.`);
}
function reviewUrl(runId) {
  const url = new URL(config.MINIAPP_URL); url.searchParams.set('run', runId); url.searchParams.set('mode', 'review');
  return url.toString();
}
async function showReview(ctx, code) {
  const m = await Mock.findOne({ code });
  const data = await catalog.reviewForUser(ctx.from, m?._id || '');
  if (config.MINIAPP_URL) return ctx.reply(`🔍 ${data.mock.title} — test tahlili\n${data.result.correct}/${data.result.total} (${data.result.percent}%).\nO‘z javoblaringiz, to‘g‘ri javoblar va xatolarni ko‘ring. Bu oynada javoblar o‘zgarmaydi.`, {
    reply_markup: new InlineKeyboard().webApp('🔍 Test tahlilini ochish', reviewUrl(m._id)),
  });
  const text = data.questions.map(q => `${q.is_correct ? '✅' : '❌'} ${q.number}. ${esc(q.text)}\nSiz: ${q.selected_answer === '-' ? 'Bo‘sh' : q.selected_answer} · To‘g‘ri: ${q.correct_answer}`).join('\n\n');
  return sendReport(ctx.api, ctx.chat.id, text);
}
async function prepareAnswer(ctx, m, text, reader) {
  if (!m || !isOpen(m)) throw new InputError('Javob qabul qilish muddati tugagan yoki mock boshlanmagan.');
  m={...m,...windowFor(m)};
  const group = await Group.findById(m.group_id);
  if (ctx.chat.type !== 'private' && group?.chat_id !== ctx.chat.id) throw new InputError('Bu mock boshqa guruhga tegishli.');
  await service.enroll(ctx.api, ctx.from, group);
  const attempt = service.accepted(await service.begin(m,ctx.from));
  const file = imageFile(ctx.message);
  const answers = file ? await aiAnswers(ctx, file, m.count, false, reader) : parseAnswers(text, m.count);
  const token = randomBytes(4).toString('hex');
  await Profile.updateOne({ telegram_id: ctx.from.id }, { $set: { pending: { mock_id: m._id, answers, nonce: attempt.nonce, token, until: new Date(m.ends_at).toISOString() } } });
  return ctx.reply(`${file ? 'Rasmdan o‘qilgan' : 'Kiritilgan'} javoblaringiz — #${m.code}:\n${answerText(answers)}\n\nTekshirib tasdiqlang. Xato bo‘lsa, javoblarni qayta yuboring. Tasdiq ham muddat tugashidan oldin bosilishi kerak.`, {
    reply_markup: new InlineKeyboard().text('✅ Javoblarni tasdiqlash', `bc:${ctx.from.id}:${token}`),
  });
}
async function personalResults(ctx) {
  const rows = await Submission.find({ telegram_id: ctx.from.id }).sort({ submitted_at: -1 }).limit(30);
  const mocks = await Mock.find({ _id: { $in: rows.map(r => r.mock_id) } });
  const byId = new Map(mocks.map(m => [m._id, m]));
  const kb = new InlineKeyboard();
  const texts = rows.filter(r => byId.has(r.mock_id)).map(r => {
    const m = byId.get(r.mock_id);
    if (!catalog.reviewReady(m,Date.now(),r)) return `🧬 <b>${esc(m.title)}</b> · #${m.code}\n✅ Javoblaringiz saqlandi.\n🔒 Natija va tahlil ${localTime(releaseAt(m,r))} (Toshkent) dan keyin ochiladi.`;
    if (config.MINIAPP_URL) kb.webApp(`🔍 Tahlil · ${m.title.slice(0, 35)}`, reviewUrl(m._id)).row();
    else kb.text(`🔍 Tahlil · ${m.title.slice(0, 35)}`, `br:${m.code}`).row();
    return `🧬 <b>${esc(m.title)}</b> · #${m.code}\n${r.correct}/${r.total} (${r.percent}%) · bo‘sh: ${r.blank}\n` +
      (r.mistakes.length ? `Xato yoki bo‘sh savollar: ${r.mistakes.join(', ')}` : 'Barcha javoblar to‘g‘ri!') +
      '\n🔍 Test tahlili ochiq.';
  });
  const chunks = messageChunks(texts.join('\n\n') || 'Yakunlangan natija hali yo‘q.');
  for (const [i, text] of chunks.entries()) await ctx.reply(text, { parse_mode: 'HTML',
    ...(i === chunks.length - 1 && kb.inline_keyboard.some(row => row.length) ? { reply_markup: kb } : {}),
  });
}
async function showGroups(ctx, choosing = false) {
  await admin(ctx);
  const groups = await Group.find({ enabled: true });
  if (!groups.length) return ctx.reply('Botni biologiya guruhingizga admin qilib qo‘shing, so‘ng guruhda /ulash yozing.');
  const kb = new InlineKeyboard();
  for (const g of groups) kb.text(g.title.slice(0, 50), `${choosing ? 'bgpick' : 'bg'}:${g._id}`).row();
  return ctx.reply(choosing ? 'Mock qaysi guruh uchun?' : 'Guruhni tanlang:', { reply_markup: kb });
}
async function groupSettings(ctx, id) {
  await admin(ctx);
  const g = await Group.findById(id);
  if (!g?.enabled) throw new InputError('Guruh ulanmagan.');
  return ctx.reply(`${g.title}\nMOCKlar har kuni 07:00–22:00 ochiq.\nNatijalar 22:10 da ilovada ochiladi.\nGuruhga natijani ko‘rish tugmasi yuboriladi. Barcha vaqtlar Toshkent bo‘yicha.`);
}
async function wizardPreview(ctx, s) {
  const g = await Group.findById(s.data.group_id);
  const when = 'Har kuni 07:00–22:00 · Natijalar 22:10';
  s.step = 'bio_publish'; setSession(ctx.from.id, s);
  return ctx.reply(`Tayyor mock:\n${s.data.title}\nSavollar: ${s.data.count}\nMavzu: ${(s.data.topics||[]).join(', ')}\nFayllar: ${s.data.materials.length}\nGuruh: ${g.title}\nVaqt: ${when}\n\nTasdiqlangach kalit va fayllar o‘zgarmaydi.`, {
    reply_markup: new InlineKeyboard().text('✅ Saqlash va ochish', `bpub:${s.data._id}`),
  });
}
async function wizardMessage(ctx, s, reader) {
  await admin(ctx);
  const text = ctx.message.text?.trim() || '';
  if (s.step === 'bio_title') {
    if (!text || text.length > 100) throw new InputError('Mock nomini 1–100 belgida yuboring.');
    s.data.title = text; s.step = 'bio_count'; setSession(ctx.from.id, s);
    return ctx.reply('Savollar sonini yuboring: 30 yoki 50. Haftalik avtomatik mock 50 savollik bo‘ladi.');
  }
  if (s.step === 'bio_count') {
    if (!['30', '50'].includes(text)) throw new InputError('30 yoki 50 yuboring.');
    s.data.count = Number(text); s.data.materials = []; s.step = 'bio_files'; setSession(ctx.from.id, s);
    return ctx.reply('Savollar faylini yuboring (PDF, HTML, ZIP, rasm yoki matn). Bir nechta fayl mumkin. Javob kalitini keyingi bosqichda alohida yuborasiz.', { reply_markup: new Keyboard().text(B.done).resized() });
  }
  if (s.step === 'bio_files') {
    if (text === B.done) {
      if (!s.data.materials.length) throw new InputError('Avval kamida bitta savollar faylini yuboring.');
      s.step = 'bio_key'; setSession(ctx.from.id, s);
      return ctx.reply(`${s.data.count} ta to‘g‘ri javob kalitini matn yoki aniq rasm qilib yuboring. Masalan: 1A 2B 3C …`, { reply_markup: { remove_keyboard: true } });
    }
    const material = materialFromMessage(ctx.message);
    if (!material || !['document', 'photo', 'text'].includes(material.kind)) throw new InputError('Savollarni fayl, rasm yoki matn qilib yuboring.');
    if (s.data.materials.length >= 20 || (material.text || '').length > (material.kind === 'text' ? 3000 : 1000)) throw new InputError('20 tagacha fayl; bitta matn 3000, fayl izohi 1000 belgigacha.');
    s.data.materials.push(material); setSession(ctx.from.id, s);
    return ctx.reply(`Saqlandi: ${s.data.materials.length} ta. Tugagach «${B.done}» bosing.`);
  }
  if (s.step === 'bio_key') {
    const file = imageFile(ctx.message);
    s.data.answer_key = file ? await aiAnswers(ctx, file, s.data.count, true, reader) : parseAnswers(text, s.data.count, true);
    s.step = 'bio_key_confirm'; setSession(ctx.from.id, s);
    return ctx.reply(`Javob kaliti:\n${answerText(s.data.answer_key)}\n\nTekshirib tasdiqlang. O‘zgartirish uchun kalitni qayta yuboring.`, { reply_markup: new InlineKeyboard().text('✅ Kalit to‘g‘ri', `bk:${s.data._id}`) });
  }
  if (s.step === 'bio_key_confirm') { s.step = 'bio_key'; return wizardMessage(ctx, s, reader); }
  if(s.step==='bio_label'){
    if(!text||text.length>100)throw new InputError('MOCK nomini 1–100 belgida kiriting.');
    s.data.title=text==='-'?s.data.title:text;s.step='bio_topics';setSession(ctx.from.id,s);
    return ctx.reply('Qaysi mavzu? Masalan: Hujayra, Fotosintez yoki 50–59-mavzular.');
  }
  if(s.step==='bio_topics'){
    if(!text||text.length>250)throw new InputError('Mavzuni 1–250 belgida kiriting.');
    s.data.topics=text.split(',').map(x=>x.trim()).filter(Boolean);s.data.plan='daily';return wizardPreview(ctx,s);
  }
  if (s.step === 'bio_schedule') {
    const match = /^(\d) (\d{2}:\d{2}) (\d{1,3})$/.exec(text);
    if (!match || +match[1] > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(match[2]) || +match[3] < 10 || +match[3] > 240) throw new InputError('Format: 0 20:00 90. Kun: 0=yakshanba … 6=shanba, muddat 10–240 daqiqa.');
    await Group.updateOne({ _id: s.data.group_id }, { $set: { weekday: +match[1], time: match[2], duration: +match[3] } });
    clearSession(ctx.from.id); return groupSettings(ctx, s.data.group_id);
  }
  return ctx.reply('Yuqoridagi tugmalardan tanlang yoki /cancel bosing.');
}
function createBot(options = {}) {
  const bot = new Bot(config.BOT_TOKEN), reader = options.readSheet || readSheet;
  bot.use(async (ctx, next) => {
    try { return await next(); }
    catch (error) {
      if (error instanceof InputError) {
        if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        return ctx.reply(error.message);
      }
      throw error; // Queue retries transient database / Telegram errors.
    }
  });
  bot.use(persistentSession);
  bot.command('id', ctx => ctx.reply(`Telegram ID: ${ctx.from.id}\nChat ID: ${ctx.chat.id}`));
  bot.command('ulash', async ctx => {
    if (!service.isOwner(ctx.from.id)) return ctx.reply('Guruhni faqat bot egasi ulashi mumkin.');
    if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Bu buyruqni biologiya guruhida yozing: /ulash');
    const me = await ctx.api.getChatMember(ctx.chat.id, ctx.me.id), owner = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    if (!['creator', 'administrator'].includes(owner.status) || !['creator', 'administrator'].includes(me.status)) throw new InputError('Siz ham, bot ham Telegram guruhida admin bo‘lishingiz kerak.');
    const g = await Group.findOneAndUpdate({ chat_id: ctx.chat.id }, { $set: { title: ctx.chat.title, enabled: true } }, { upsert: true, new: true });
    await service.enroll(ctx.api, ctx.from, g);
    return ctx.reply('🧬 Biologiya mock guruhi ulandi! Har bir a’zo «Qatnashaman» tugmasini bir marta bossin. MOCKlar har kuni 07:00–22:00 ochiq, natijalar 22:10 da ilovada ochiladi.', {
      reply_markup: new InlineKeyboard().text('🙋 Qatnashaman', `bj:${g._id}`),
    });
  });
  bot.command('uzish', async ctx => {
    if (!service.isOwner(ctx.from.id) || ctx.chat.type === 'private') return;
    const g = await Group.findOneAndUpdate({ chat_id: ctx.chat.id }, { $set: { enabled: false, weekly_enabled: false } }, { new: true });
    if (g) await Mock.updateMany({ group_id: g._id, status: { $in: ['queued', 'scheduled', 'opening', 'open', 'daily'] } }, { $set: { status: 'cancelled' } });
    return ctx.reply('Guruh ulanishi va shu guruhdagi tugallanmagan mocklar to‘xtatildi.');
  });
  bot.command('qatnashaman', async ctx => {
    if (ctx.chat.type === 'private') return ctx.reply('Bu buyruqni ulangan biologiya guruhida yozing.');
    const g = await Group.findOne({ chat_id: ctx.chat.id, enabled: true });
    await service.enroll(ctx.api, ctx.from, g); return ctx.reply('✅ Mock qatnashchilari ro‘yxatiga qo‘shildingiz. Testni botda oching:', {
      reply_markup: new InlineKeyboard().url('🧬 Testga o‘tish', `https://t.me/${ctx.me.username}?start=g_${g._id}`),
    });
  });
  bot.callbackQuery(/^bjoin:([a-f\d]{6})$/, async ctx => {
    const m = await enrollForMock(ctx, ctx.match[1]);
    return ctx.answerCallbackQuery({ url: `https://t.me/${ctx.me.username}?start=m_${m.code}`, cache_time: 0 });
  });
  bot.callbackQuery(/^bj:([a-f\d]{24})$/, async ctx => {
    const g = await Group.findById(ctx.match[1]);
    if (ctx.chat.type !== 'private' && g?.chat_id !== ctx.chat.id) throw new InputError('Guruh mos kelmadi.');
    // Old group announcements used a group-only callback. Keep those buttons
    // working, and recover the exact mock from their announcement message.
    const announcement = ctx.callbackQuery.message;
    const m = announcement && g?.chat_id === announcement.chat.id && await Mock.findOne({ group_id: g._id, announcement_id: announcement.message_id });
    if (m) await enrollForMock(ctx, m.code);
    else await service.enroll(ctx.api, ctx.from, g);
    return ctx.answerCallbackQuery({ url: `https://t.me/${ctx.me.username}?start=${m ? `m_${m.code}` : `g_${g._id}`}`, cache_time: 0 });
  });
  bot.callbackQuery(/^bc:(\d+):([a-f\d]{8})$/, async ctx => {
    if (Number(ctx.match[1]) !== ctx.from.id) return ctx.answerCallbackQuery({ text: 'Bu boshqa o‘quvchining javoblari.', show_alert: true });
    const p = await Profile.findOne({ telegram_id: ctx.from.id });
    if (!p?.pending || p.pending.token !== ctx.match[2]) return ctx.answerCallbackQuery({ text: 'Bu tasdiq eskirgan. Javoblarni qayta yuboring.', show_alert: true });
    const m = await Mock.findById(p.pending.mock_id), g = m && await Group.findById(m.group_id);
    if (ctx.chat.type !== 'private' && ctx.chat.id !== g?.chat_id) throw new InputError('Guruh mos kelmadi.');
    await service.enroll(ctx.api, ctx.from, g);
    const result=service.accepted(await service.accept(m, ctx.from, p.pending.answers, p.pending.nonce));
    await Profile.updateOne({ telegram_id: ctx.from.id, 'pending.token': ctx.match[2] }, { $unset: { pending: 1 } });
    await ctx.answerCallbackQuery({ text: '✅ Javoblar qabul qilindi.' });
    return ctx.editMessageText(`✅ ${service.isOwner(ctx.from.id) ? 'Sizning' : 'O‘quvchining'} javoblari qabul qilindi — #${m.code}.\n🔒 Natija, to‘g‘ri javoblar va tahlil ${localTime(result.available_at||releaseAt(m))} (Toshkent) dan keyin ochiladi.\nQayta topshirish uchun admin ruxsati kerak.${ctx.chat.type === 'private' ? '\nVaqt tugagach → Natijalarim.' : ''}`);
  });
  bot.command('javob', async ctx => {
    const match = /^([a-f\d]{6})\s+([\s\S]+)$/i.exec(ctx.match.trim());
    if (!match) return ctx.reply('Format: /javob MOCKKOD 1A 2B 3C …\nYoki botda mockni tanlab javob varaqasi rasmini yuboring.');
    const m = await Mock.findOne({ code: match[1].toLowerCase() });
    return prepareAnswer(ctx, m, match[2], reader);
  });
  bot.on('my_chat_member', async ctx => {
    if (!isMember(ctx.myChatMember.new_chat_member)) await Group.updateOne({ chat_id: ctx.chat.id }, { $set: { enabled: false, weekly_enabled: false } });
  });
  bot.on('chat_member', async ctx => {
    const g = await Group.findOne({ chat_id: ctx.chat.id, enabled: true });
    const member = ctx.chatMember.new_chat_member;
    if (!g || member.user.is_bot) return;
    if (isMember(member)) return service.enroll(ctx.api, member.user, g);
    const p = await Profile.findOne({ telegram_id: member.user.id });
    if (p) await Profile.updateOne({ telegram_id: member.user.id }, { $set: { group_ids: p.group_ids.filter(id => id !== g._id) } });
  });
  // Group submissions must reply to this mock's announcement; arbitrary chat
  // text and images are never sent to the AI reader.
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private') return next();
    if (ctx.message?.migrate_to_chat_id) { await Group.updateOne({ chat_id: ctx.chat.id }, { $set: { chat_id: ctx.message.migrate_to_chat_id } }); return; }
    if (ctx.message?.reply_to_message) {
      const g = await Group.findOne({ chat_id: ctx.chat.id, enabled: true });
      const m = g && await Mock.findOne({ group_id: g._id, status: {$in:['open','daily']}, announcement_id: ctx.message.reply_to_message.message_id });
      if (m) return prepareAnswer(ctx, m, ctx.message.text, reader);
    }
    if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: 'Botning shaxsiy chatini oching.' });
  });
  registerQuizUI(bot);
  bot.command('start', async ctx => {
    clearSession(ctx.from.id);
    const payload = ctx.match.trim();
    if(payload==='results')return ctx.reply('📊 Natijalar sana, topshirilgan vaqt va MOCK bo‘yicha tartiblangan.',{reply_markup:new InlineKeyboard().webApp('📊 Natijangizni ko‘rish',config.MINIAPP_URL+'?tab=results')});
    if (/^g_[a-f\d]{24}$/.test(payload)) return joinGroup(ctx, payload.slice(2));
    if (/^r_[a-f\d]{6}$/.test(payload)) return showReview(ctx, payload.slice(2));
    if (/^m_[a-f\d]{6}$/.test(payload)) return selectMock(ctx, payload.slice(2));
    return menu(ctx);
  });
  bot.command(['menu', 'cancel'], async ctx => { clearSession(ctx.from.id); return menu(ctx); });
  bot.hears([B.student, B.admin], async ctx => {
    if (!service.isOwner(ctx.from.id)) return ctx.reply('Rejim almashtirish faqat bot egasi uchun.');
    await service.profile(ctx.from);
    const mode = ctx.message.text === B.admin ? 'admin' : 'student';
    await Profile.updateOne({ telegram_id: ctx.from.id }, { $set: { mode } });
    clearSession(ctx.from.id); return menu(ctx, mode === 'admin' ? '🛠 Admin rejimi yoqildi.' : '🎓 O‘quvchi rejimi yoqildi. Siz ham mock topshirib reytingda qatnashasiz.');
  });
  bot.command('mock', listMocks); bot.hears([B.mocks, B.answer], listMocks);
  bot.callbackQuery(/^bm:([a-f\d]{6})$/, async ctx => { await ctx.answerCallbackQuery(); return selectMock(ctx, ctx.match[1]); });
  bot.command('natijalar', personalResults); bot.hears(B.results, personalResults);
  bot.callbackQuery(/^br:([a-f\d]{6})$/, async ctx => { await ctx.answerCallbackQuery(); return showReview(ctx, ctx.match[1]); });
  bot.hears(B.rank,ctx=>ctx.reply('📊 Kunlik va haftalik natijalarni ilovada ko‘ring.',{reply_markup:new InlineKeyboard().webApp('📊 Natijalar',config.MINIAPP_URL+'?tab=results')}));
  bot.hears(B.help,ctx=>ctx.reply('1. Guruhda «Qatnashaman» bosing.\n2. MOCKlar har kuni 07:00–22:00 ochiq. Nom va mavzu bo‘yicha tanlang.\n3. Oddiy natija va tahlil 22:10 da ilovada ochiladi.\n4. Musobaqa bo‘limida 2–3 kishilik xona yarating yoki kod bilan qo‘shiling. Hamma topshirgach g‘olib chiqadi.\nBarcha vaqtlar Toshkent bo‘yicha.'));
  bot.hears(B.create, async ctx => { await admin(ctx); setSession(ctx.from.id, { step: 'bio_title', data: { _id: randomBytes(12).toString('hex') } }); return ctx.reply('Yangi biologiya mock nomini yuboring. /cancel — bekor qilish.'); });
  bot.hears(B.groups, ctx => showGroups(ctx));
  bot.hears(B.bank, async ctx => {
    await admin(ctx);
    const mocks = await Mock.find({status:{$ne:'deleted'},kind:{$ne:'room'}}).sort({ createdAt: -1 }).limit(30);
    const kb = new InlineKeyboard();
    for (const m of mocks) if (['queued', 'scheduled', 'daily'].includes(m.status)) kb.text(`Bekor qilish: ${m.title.slice(0, 30)}`, `bdel:${m._id}`).row();
    await sendReport(ctx.api, ctx.chat.id, mocks.map(m => `#${m.code} · ${esc(m.title)} · ${m.count} · ${esc(m.status)}${m.starts_at ? ` · ${localTime(m.starts_at)}` : ''}`).join('\n') || 'Mocklar navbati bo‘sh.');
    if (kb.inline_keyboard.length) return ctx.reply('Boshlanmagan mockni navbatdan olib tashlash:', { reply_markup: kb });
  });
  bot.callbackQuery(/^bdel:([a-f\d]{24})$/, async ctx => {
    await admin(ctx); await Mock.updateOne({ _id: ctx.match[1], status: { $in: ['queued', 'scheduled', 'daily'] } }, { $set: { status: 'cancelled' } });
    return ctx.answerCallbackQuery({ text: 'Boshlanmagan mock bekor qilindi.' });
  });
  bot.callbackQuery(/^bg:([a-f\d]{24})$/, async ctx => { await ctx.answerCallbackQuery(); return groupSettings(ctx, ctx.match[1]); });
  bot.callbackQuery(/^bg[ts]:([a-f\d]{24})$/,async ctx=>{await admin(ctx);await ctx.answerCallbackQuery();return groupSettings(ctx,ctx.match[1]);});
  bot.callbackQuery(/^bk:([a-f\d]{24})$/, async ctx => {
    await admin(ctx); const s = getSession(ctx.from.id);
    if (s?.step !== 'bio_key_confirm' || s.data._id !== ctx.match[1]) throw new InputError('Kalit tasdig‘i eskirgan.');
    s.step = 'bio_group'; setSession(ctx.from.id, s); await ctx.answerCallbackQuery(); return showGroups(ctx, true);
  });
  bot.callbackQuery(/^bgpick:([a-f\d]{24})$/, async ctx => {
    await admin(ctx); const s = getSession(ctx.from.id), g = await Group.findById(ctx.match[1]);
    if (s?.step !== 'bio_group' || !g?.enabled) throw new InputError('Mock yoki guruh tanlovi eskirgan.');
    s.data.group_id = g._id; s.step = 'bio_label'; setSession(ctx.from.id, s);
    await ctx.answerCallbackQuery(); return ctx.reply(`O‘quvchilar ko‘radigan MOCK nomini yuboring.\nHozirgi nom: ${s.data.title}\nShu nomni qoldirish uchun - yuboring.`);
  });
  bot.callbackQuery(/^bp:(weekly|now|date)$/,async ctx=>{await admin(ctx);await ctx.answerCallbackQuery();return ctx.reply('Vaqt tanlash olib tashlangan. MOCKni qayta tanlang: har kuni 07:00–22:00 ochiq bo‘ladi.');});
  bot.callbackQuery(/^bpub:([a-f\d]{24})$/, async ctx => {
    await admin(ctx); const s = getSession(ctx.from.id);
    if (s?.step !== 'bio_publish' || s.data._id !== ctx.match[1]) throw new InputError('Bu saqlash tugmasi eskirgan. /menu orqali tekshiring.');
    const d = s.data, g = await Group.findById(d.group_id);
    if (!g?.enabled) throw new InputError('Guruh ulanmagan.');
    const imported = d.package_id ? catalog.snapshot(await require('../storage/postgres').BioPackage.findById(d.package_id)) : {};
    const existing=d.package_id&&await Mock.findOne({package_id:d.package_id,group_id:g._id,status:'daily'});
    if(existing){d._id=existing._id;await Mock.updateOne({_id:d._id},{$set:{title:d.title,topics:d.topics||[]}});}
    if (!await Mock.exists({ _id: d._id })) await Mock.create({ ...imported, _id: d._id, code: randomBytes(3).toString('hex'), title: d.title, topics:d.topics||[],count: d.count,
      materials: d.materials, answer_key: d.answer_key, group_id: g._id, status:'daily',kind:'daily' });
    await Group.updateOne({_id:g._id},{$set:{daily_mode:true,weekly_enabled:false}});
    const saved=await Mock.findById(d._id);
    await service.delivered(`bio:catalog:${saved._id}`,async()=>{const message=await ctx.api.sendMessage(g.chat_id,
      `🧬 ${saved.title} · #${saved.code}\nMavzu: ${(saved.topics||[]).join(', ')}\n${saved.count} savol · Har kuni 07:00–22:00\nNatijalar 22:10 da ilovada ochiladi.`,
      {reply_markup:new InlineKeyboard().text('🙋 Qatnashaman',`bjoin:${saved.code}`)});await Mock.updateOne({_id:saved._id},{$set:{announcement_id:message.message_id}});return message;});
    for(const [i,material] of (saved.materials||[]).entries())await service.delivered(`bio:catalog:${saved._id}:file:${i}`,()=>sendMaterial(ctx.api,g.chat_id,material));
    clearSession(ctx.from.id); await ctx.answerCallbackQuery({ text: 'Mock saqlandi.' });
    return menu(ctx,'✅ MOCK qo‘shildi. Har kuni 07:00–22:00 ochiq, natijalar 22:10 da.');
  });
  registerImportUI(bot, {admin, showGroups, menu, download:options.downloadImport});
  bot.on('message', async ctx => {
    const s = getSession(ctx.from.id);
    if (s?.step === 'bio_answer') return prepareAnswer(ctx, await Mock.findById(s.data.mock_id), ctx.message.text, reader);
    if (s?.step?.startsWith('bio_')) return wizardMessage(ctx, s, reader);
    return menu(ctx, 'Menyudan tanlang. Javob topshirish uchun avval mockni tanlang.');
  });
  return bot;
}
module.exports = { createBot, keyboard, B, commands, prepareAnswer };
