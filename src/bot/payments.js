const { InlineKeyboard } = require('grammy');
const { User } = require('../models/app');
const { GroupChat } = require('../models/bot');
const { subscriptionState, endOfMonth, tashkentParts } = require('../lib/time');
const { esc, isAdmin, adminChatIds, actorUserId } = require('./common');
const { deliverOnce, sendReport } = require('../lib/delivery');
const { roster } = require('./attendance');

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

/**
 * To'lov holati ilovadagi qoidaga ko'ra: obuna muddati (subscription_end_date) o'tmagan bo'lsa — to'lagan.
 * Muddati o'tgan (5 kunlik imtiyoz ichida ham) yoki bloklangan — to'lamagan.
 */
async function split(group) {
  const students = await roster(group);
  const now = new Date();
  const paid = students.filter((s) => subscriptionState(s, now) === 'paid');
  const unpaid = students.filter((s) => subscriptionState(s, now) !== 'paid');
  return { paid, unpaid };
}

const monthTitle = () => {
  const p = tashkentParts();
  return `${MONTHS[p.month - 1]} ${p.year}`;
};

/** Guruhga: kim to'lagan, kim to'lamagan */
async function postReport(api, group, key) {
  const { paid, unpaid } = await split(group);
  const list = (arr) => (arr.length ? arr.map((s, i) => `${i + 1}. ${esc(String(s.full_name).slice(0, 150))}`).join('\n') : '—');
  const text =
    `💰 <b>Oylik to'lov — ${monthTitle()}</b>\n\n` +
    `✅ <b>To'laganlar (${paid.length}):</b>\n${list(paid)}\n\n` +
    `❌ <b>To'lamaganlar (${unpaid.length}):</b>\n${list(unpaid)}` +
    (unpaid.length ? "\n\nIltimos, to'lovni o'z vaqtida amalga oshiring 🙏" : '');
  return sendReport(api, group.chat_id, text, key);
}

/** Adminga: to'lamaganlar ro'yxati, har biri yonida "To'ladi" tugmasi */
async function unpaidSheet(group, requestedPage = 0) {
  const { unpaid } = await split(group);
  const kb = new InlineKeyboard();
  const pages = Math.max(1, Math.ceil(unpaid.length / 40));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pages - 1);
  unpaid.slice(page * 40, (page + 1) * 40).forEach((s) => kb.text(`💵 ${s.full_name}`.slice(0, 40), `pay:${s._id}`).row());
  if (page > 0) kb.text('⬅️', `paylist:${group._id}:${page - 1}`);
  if (page + 1 < pages) kb.text('➡️', `paylist:${group._id}:${page + 1}`);
  const text = unpaid.length
    ? `💰 <b>${esc(group.title || group.group_name || 'Guruh')}</b> — to'lamaganlar (${unpaid.length}). Sahifa ${page + 1}/${pages}.\nTo'lov qilganini belgilash uchun ismini bosing (shu oy oxirigacha ochiladi, ilovada ham ko'rinadi).`
    : `💰 <b>${esc(group.title || group.group_name || 'Guruh')}</b> — hamma to'lagan ✅`;
  return { text, kb };
}

async function sendUnpaidToAdmins(api, group, key) {
  const { text, kb } = await unpaidSheet(group);
  const errors = [];
  for (const id of await adminChatIds()) {
    try {
      const send = () => api.sendMessage(id, text, { parse_mode: 'HTML', reply_markup: kb });
      if (key) await deliverOnce(`${key}:${id}`, send);
      else await send();
    } catch (error) { errors.push(error); }
  }
  if (errors.length) throw errors[0];
}

/**
 * Ilovadagi POST /api/admin/students/:id/pay {months:1} bilan bir xil: obuna joriy taqvim oyi oxirigacha,
 * status 'active', payments tarixiga yozuv.
 */
async function markPaid(userId, byUserId, now = new Date()) {
  const student = await User.findOne({ _id: userId, role: 'student' }).lean();
  if (!student) return { ok: false, reason: 'not_found' };
  const target = endOfMonth(now, 0);
  if (student.status === 'active' && student.subscription_end_date && target <= new Date(student.subscription_end_date)) {
    return { ok: false, reason: 'already', student };
  }
  const result = await User.updateOne(
    { _id: student._id, role: 'student', $or: [
      { status: { $ne: 'active' } }, { subscription_end_date: { $lt: target } },
      { subscription_end_date: null },
    ] },
    {
      $set: { status: 'active' },
      $max: { subscription_end_date: target },
      $push: { payments: { $each: [{ paid_at: now, paid_through: target, kind: 'month', months: 1, note: 'Telegram bot', by: byUserId }], $slice: -60 } },
    }
  );
  if (!result.modifiedCount) return { ok: false, reason: 'already', student };
  const effectiveTarget = student.subscription_end_date && new Date(student.subscription_end_date) > target ? new Date(student.subscription_end_date) : target;
  return { ok: true, student, target: effectiveTarget };
}

function register(bot) {
  bot.callbackQuery(/^pay:([a-f\d]{24})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const student = await User.findById(ctx.match[1]).select('full_name').lean();
    if (!student) return ctx.answerCallbackQuery({ text: 'Topilmadi' });
    await ctx.answerCallbackQuery();
    return ctx.reply(`<b>${esc(student.full_name)}</b> shu oy uchun to'lov qildimi?`, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text("✅ Ha, to'ladi", `payok:${student._id}`).text("✖️ Yo'q", 'cancel'),
    });
  });

  bot.callbackQuery(/^payok:([a-f\d]{24})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const r = await markPaid(ctx.match[1], await actorUserId(ctx.from.id));
    await ctx.answerCallbackQuery();
    if (!r.ok && r.reason === 'already') return ctx.editMessageText(`ℹ️ ${esc(r.student.full_name)} — obuna allaqachon to'langan.`, { parse_mode: 'HTML' });
    if (!r.ok) return ctx.editMessageText("O'quvchi topilmadi.");
    return ctx.editMessageText(`✅ <b>${esc(r.student.full_name)}</b> — to'lov qayd etildi. Obuna ${r.target.toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' })} gacha ochiq.`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery(/^payrep:([a-f\d]{24})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const group = await GroupChat.findById(ctx.match[1]).lean();
    if (!group) return ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
    await postReport(ctx.api, group);
    return ctx.answerCallbackQuery({ text: '📤 Guruhga yuborildi' });
  });

  bot.callbackQuery(/^paylist:([a-f\d]{24})(?::(\d{1,5}))?$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const group = await GroupChat.findById(ctx.match[1]).lean();
    if (!group) return ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
    await ctx.answerCallbackQuery();
    const { text, kb } = await unpaidSheet(group, Number(ctx.match[2] || 0));
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });
}

module.exports = { register, postReport, sendUnpaidToAdmins, markPaid, split, unpaidSheet };
