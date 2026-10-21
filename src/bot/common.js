const { Keyboard } = require('grammy');
const config = require('../config');
const { User } = require('../models/app');
const { TgLink, BotSession } = require('../models/bot');

/**
 * Har bir yangilanishda MongoDB'dan olinadi va qayta saqlanadi (24 soat).
 * Parol matni hech qachon session ichiga yozilmaydi.
 */
const sessions = new Map();
const getSession = (id) => sessions.get(id) || null;
const setSession = (id, s) => sessions.set(id, s);
const clearSession = (id) => sessions.delete(id);

async function persistentSession(ctx, next) {
  if (!ctx.from || ctx.chat?.type !== 'private') return next();
  const id = ctx.from.id;
  const saved = await BotSession.findOne({ telegram_id: id, expires_at: { $gt: new Date() } }).lean();
  if (saved) sessions.set(id, saved.data);
  else sessions.delete(id);
  try { return await next(); }
  finally {
    const data = sessions.get(id);
    try {
      if (data) await BotSession.updateOne({ telegram_id: id }, { $set: {
        data, expires_at: new Date(Date.now() + 24 * 3600_000),
      } }, { upsert: true });
      else await BotSession.deleteOne({ telegram_id: id });
    } finally { sessions.delete(id); }
  }
}

/** Bosqich nomi -> matn/fayl qabul qiluvchi funksiya. Modullar o'zlarinikini ro'yxatdan o'tkazadi. */
const steps = {};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function linkedUser(telegramId) {
  const link = await TgLink.findOne({ telegram_id: telegramId }).lean();
  if (!link) return null;
  return User.findById(link.user).lean();
}

/** Admin: .env dagi ADMIN_IDS yoki ilovada role=admin bo'lgan bog'langan foydalanuvchi */
async function isAdmin(telegramId) {
  if (config.ADMIN_IDS.includes(telegramId)) return true;
  const u = await linkedUser(telegramId);
  return Boolean(u && u.role === 'admin');
}

/** Barcha adminlarning Telegram chat ID'lari (xabar yuborish uchun) */
async function adminChatIds() {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  const links = await TgLink.find({ user: { $in: admins.map((a) => a._id) } }).select('telegram_id').lean();
  return [...new Set([...config.ADMIN_IDS, ...links.map((l) => l.telegram_id)])];
}

/** Admin bajargan amal uchun ilovadagi foydalanuvchi ID'si (Attendance.by, payments.by) */
async function actorUserId(telegramId) {
  const link = await TgLink.findOne({ telegram_id: telegramId }).select('user').lean();
  return link ? link.user : undefined;
}

const BTN = {
  ielts: '🇬🇧 IELTS',
  cefr: '🇪🇺 CEFR',
  results: '📊 Natijalarim',
  rating: '🏆 Reyting',
  chart: '📈 Grafik',
  screenshot: '📷 Natija skrinshoti',
  addTest: "➕ Test qo'shish",
  tests: '📚 Testlar',
  writing: '📝 Writing tekshirish',
  groups: '👥 Guruhlar',
  payments: "💰 To'lovlar",
  logout: '🚪 Chiqish',
};

function mainMenu({ student, admin }) {
  const kb = new Keyboard();
  if (student) {
    kb.text(BTN.ielts).text(BTN.cefr).row().text(BTN.results).text(BTN.rating).row();
    kb.text(BTN.screenshot).row();
    if (config.WEBAPP_URL) kb.webApp(BTN.chart, config.WEBAPP_URL).row();
  }
  if (admin) {
    kb.text(BTN.addTest).text(BTN.tests).row().text(BTN.writing).text(BTN.groups).row().text(BTN.payments).row();
  }
  if (student) kb.text(BTN.logout);
  return kb.resized();
}

async function sendMenu(ctx, text = 'Asosiy menyu:') {
  const user = await linkedUser(ctx.from.id);
  const admin = await isAdmin(ctx.from.id);
  return ctx.reply(text, { reply_markup: mainMenu({ student: Boolean(user), admin }), parse_mode: 'HTML' });
}

/** Material yoki o'quvchi faylini qayta yuborish */
async function sendMaterial(api, chatId, m) {
  switch (m.kind) {
    case 'text': return api.sendMessage(chatId, m.text);
    case 'audio': return api.sendAudio(chatId, m.file_id, { caption: m.text || undefined });
    case 'voice': return api.sendVoice(chatId, m.file_id, { caption: m.text || undefined });
    case 'document': return api.sendDocument(chatId, m.file_id, { caption: m.text || undefined });
    case 'photo': return api.sendPhoto(chatId, m.file_id, { caption: m.text || undefined });
    case 'video': return api.sendVideo(chatId, m.file_id, { caption: m.text || undefined });
    default: return null;
  }
}

/** Kelgan xabardan material ajratib olish (matn, audio, ovozli, fayl, rasm, video) */
function materialFromMessage(msg) {
  const caption = msg.caption || '';
  if (msg.text) return { kind: 'text', text: msg.text };
  if (msg.audio) return { kind: 'audio', file_id: msg.audio.file_id, text: caption };
  if (msg.voice) return { kind: 'voice', file_id: msg.voice.file_id, text: caption };
  if (msg.document) return { kind: 'document', file_id: msg.document.file_id, text: caption };
  if (msg.photo) return { kind: 'photo', file_id: msg.photo[msg.photo.length - 1].file_id, text: caption };
  if (msg.video) return { kind: 'video', file_id: msg.video.file_id, text: caption };
  return null;
}

/** Ko'p adminga yuborishda bittasi xato bersa (botni bloklagan) qolganlari to'xtamasin */
async function safeSend(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('Telegram xabar xatosi:', e.description || e.message);
    return null;
  }
}

module.exports = {
  sessions, getSession, setSession, clearSession, persistentSession, steps, esc,
  linkedUser, isAdmin, adminChatIds, actorUserId,
  BTN, mainMenu, sendMenu, sendMaterial, materialFromMessage, safeSend,
};
