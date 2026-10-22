const { InlineKeyboard } = require('grammy');
const config = require('../config');
const { User } = require('../models/app');
const { GroupChat } = require('../models/bot');
const { linkAccount } = require('../lib/linking');
const { isMember, fullName } = require('../lib/enrollment');
const { getSession, setSession, clearSession, steps, sendMenu, esc } = require('./common');

async function allowedGroup(ctx, id) {
  const group = await GroupChat.findOne({ _id: id, enabled: true }).lean();
  if (!group) { await ctx.reply('Guruh havolasi faol emas. Admin yangi havola yuborsin.'); return null; }
  let member;
  try { member = await ctx.api.getChatMember(group.chat_id, ctx.from.id); }
  catch { await ctx.reply('Guruh a’zoligini tekshira olmadim. Admin botni guruhda administrator qilsin, keyin qayta urinib ko‘ring.'); return null; }
  if (!isMember(member)) { await ctx.reply('Avval shu Telegram guruhiga a’zo bo‘ling, keyin havolani qayta oching.'); return null; }
  return group;
}

async function enroll(ctx, group, name) {
  const user = await User.findOneAndUpdate({ telegram_id: ctx.from.id }, {
    $setOnInsert: { full_name: name, name_key: User.nameKey(name), role: 'student', status: 'active' },
    $set: { group_name: group.group_name || group.title }, $addToSet: { group_ids: group._id },
  }, { upsert: true, new: true });
  await linkAccount(ctx.from.id, user._id, ctx.from.username);
  clearSession(ctx.from.id);
  return sendMenu(ctx, `✅ <b>${esc(user.full_name)}</b>, ro‘yxatdan o‘tdingiz.\n📚 «Materiallar»dan testni tanlang.`);
}

async function start(ctx) {
  const match = /^join_([a-f\d]{24})$/.exec(String(ctx.match || '').trim());
  const user = await User.findOne({ telegram_id: ctx.from.id }).lean();
  if (match) {
    if (getSession(ctx.from.id) && !['register_name'].includes(getSession(ctx.from.id).step)) {
      return ctx.reply('Boshlangan ish saqlangan. Avval uni yakunlang yoki /cancel bosing, keyin guruh havolasini qayta oching.');
    }
    const group = await allowedGroup(ctx, match[1]);
    if (!group) return;
    if (user) return enroll(ctx, group, user.full_name);
    setSession(ctx.from.id, { step: 'register_name', groupId: String(group._id) });
    return ctx.reply('Ism-familiyangizni yozing. Davomat va natijalar guruhga shu ism bilan chiqadi:', {
      reply_markup: new InlineKeyboard().text('Bekor qilish', 'cancel'),
    });
  }
  if (getSession(ctx.from.id)) return ctx.reply('Boshlangan ish saqlangan. Oxirgi so‘ralgan matn yoki rasmni yuboring. Tahlilni davom ettirish: /tahlil. Bekor qilish: /cancel');
  if (user?.group_ids?.length) {
    await linkAccount(ctx.from.id, user._id, ctx.from.username);
    return sendMenu(ctx, `Assalomu alaykum, <b>${esc(user.full_name)}</b>!`);
  }
  if (config.ADMIN_IDS.includes(ctx.from.id)) return sendMenu(ctx, 'Admin menyusi. Botni guruhga admin qilib qo‘shing va guruhda /ulash 1-guruh yozing.');
  return ctx.reply('Assalomu alaykum! Ro‘yxatdan o‘tish uchun o‘quv guruhingizdagi «Botga ro‘yxatdan o‘tish» tugmasini bosing. Admin /ulash orqali havolani chiqaradi.');
}

steps.register_name = async (ctx, session) => {
  if (!config.STANDALONE) return;
  const name = fullName(ctx.message.text);
  if (!name) return ctx.reply('Ism-familiyani matn bilan yozing (3–80 belgi).');
  const group = await allowedGroup(ctx, session.groupId);
  if (group) return enroll(ctx, group, name);
};

module.exports = { start, allowedGroup, enroll };
