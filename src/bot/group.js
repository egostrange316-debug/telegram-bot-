const config = require('../config');
const { InlineKeyboard } = require('grammy');
const { rosterFilter, isMember } = require('../lib/enrollment');
const { User } = require('../models/app');
const { GroupChat } = require('../models/bot');
const { parseHHMM, formatHHMM } = require('../lib/time');
const { esc, isAdmin } = require('./common');
const attendance = require('./attendance');
const payments = require('./payments');
const { DAY_NAMES } = require('./admin');

const inGroup = (ctx) => ['group', 'supergroup'].includes(ctx.chat?.type);

/** Guruh buyruqlari: faqat guruh ichida va faqat admin */
const groupAdmin = (fn) => async (ctx) => {
  if (!inGroup(ctx)) return ctx.reply("Bu buyruq Telegram guruhning o'zida yoziladi.");
  if (!(await isAdmin(ctx.from.id))) return ctx.reply('Bu buyruq faqat o\'quv markaz admini uchun.');
  const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
  if (!['creator', 'administrator'].includes(member.status)) return ctx.reply('Siz Telegram guruhida ham admin bo‘lishingiz kerak.');
  return fn(ctx);
};

async function connectedGroup(ctx) {
  const g = await GroupChat.findOne({ chat_id: ctx.chat.id, enabled: true }).lean();
  if (!g) await ctx.reply('Guruh hali ulanmagan. Avval: /ulash 1-guruh');
  return g;
}

function settingsText(g) {
  return (
    `⚙️ <b>Sozlamalar</b>\nGuruh: <b>${esc(g.group_name || g.title || "barcha o'quvchilar")}</b>\n` +
    `⏰ Davomat: <b>${g.attendance_time}</b> (${g.days.map((d) => DAY_NAMES[d]).join(', ')}) — ro'yxat admin uchun ${config.ATTENDANCE_OPEN_BEFORE_MIN} daqiqa oldin ochiladi\n` +
    `💰 To'lov hisoboti: har oyning <b>${g.pay_day}-kuni</b>, ${g.pay_time}`
  );
}

function register(bot) {
  bot.on('chat_member', async ctx => {
    if (!config.STANDALONE || isMember(ctx.chatMember.new_chat_member)) return;
    const group = await GroupChat.findOne({ chat_id: ctx.chat.id }).select('_id').lean();
    if (group) await User.updateOne({ telegram_id: ctx.chatMember.new_chat_member.user.id }, { $pull: { group_ids: group._id } });
  });
  bot.on('message:migrate_to_chat_id', async (ctx) => {
    await GroupChat.updateOne({ chat_id: ctx.chat.id }, { $set: { chat_id: ctx.message.migrate_to_chat_id } });
  });
  bot.on('message:migrate_from_chat_id', async (ctx) => {
    await GroupChat.updateOne({ chat_id: ctx.message.migrate_from_chat_id }, { $set: { chat_id: ctx.chat.id, title: ctx.chat.title } });
  });
  // Botni guruhga qo'shishganda yo'riqnoma
  bot.on('my_chat_member', async (ctx) => {
    const st = ctx.myChatMember.new_chat_member.status;
    if (inGroup(ctx) && ['member', 'administrator'].includes(st) && !['member', 'administrator'].includes(ctx.myChatMember.old_chat_member.status)) {
      await ctx.reply("Salom! 👋 Davomat va natijalarni shu guruhga yuborib turaman.\nBotni admin qiling, so‘ng <code>/ulash 1-guruh</code> deb yozing.", { parse_mode: 'HTML' }).catch(() => {});
    }
    if (inGroup(ctx) && ['left', 'kicked'].includes(st)) await GroupChat.updateOne({ chat_id: ctx.chat.id }, { $set: { enabled: false } });
  });

  bot.command('ulash', groupAdmin(async (ctx) => {
    const name = ctx.match.trim() || (config.STANDALONE ? ctx.chat.title || 'Guruh' : null);
    if (name?.length > 80) return ctx.reply('Guruh nomi 80 belgidan oshmasin.');
    const filter = { role: 'student', ...(name ? { group_name: name } : {}) };
    let count = await User.countDocuments(filter);
    if (!config.STANDALONE && name && !count) {
      const names = (await User.distinct('group_name', { role: 'student' })).filter(Boolean);
      return ctx.reply(`❌ Ilovada «${esc(name)}» guruhi topilmadi.\nMavjud guruhlar: ${names.map(esc).join(', ') || '—'}`, { parse_mode: 'HTML' });
    }
    const g = await GroupChat.findOneAndUpdate(
      { chat_id: ctx.chat.id },
      { $set: { title: ctx.chat.title, group_name: name, enabled: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    if (config.STANDALONE) count = await User.countDocuments(rosterFilter(g));
    const warn = count > attendance.MAX_SHEET ? `\n\nDavomat ro‘yxati ${attendance.MAX_SHEET} tadan sahifalanadi.` : '';
    const username = config.BOT_USERNAME || ctx.me.username;
    const link = config.STANDALONE ? new InlineKeyboard().url('📝 Botga ro‘yxatdan o‘tish', `https://t.me/${username}?start=join_${g._id}`) : undefined;
    return ctx.reply(`✅ Guruh ulandi. O'quvchilar: ${count} ta.\n\n${settingsText(g)}${warn}` +
      (config.STANDALONE ? '\n\nO‘quvchilar pastdagi tugmani bosib ism-familiyasini yozsin.' : ''),
      { parse_mode: 'HTML', reply_markup: link });
  }));

  bot.command('uzish', groupAdmin(async (ctx) => {
    await GroupChat.updateOne({ chat_id: ctx.chat.id }, { $set: { enabled: false } });
    return ctx.reply("Guruh uzildi. Endi davomat va to'lov xabarlari yuborilmaydi.");
  }));

  bot.command('sozlamalar', groupAdmin(async (ctx) => {
    const g = await connectedGroup(ctx);
    return g && ctx.reply(settingsText(g), { parse_mode: 'HTML' });
  }));

  bot.command('davomat_vaqti', groupAdmin(async (ctx) => {
    const min = parseHHMM(ctx.match);
    if (min === null) return ctx.reply('Masalan: /davomat_vaqti 14:00');
    const g = await GroupChat.findOneAndUpdate({ chat_id: ctx.chat.id, enabled: true }, { $set: { attendance_time: formatHHMM(min) } }, { new: true }).lean();
    if (!g) return connectedGroup(ctx);
    return ctx.reply(`✅ Davomat vaqti: ${g.attendance_time}. Ro'yxat admin uchun ${formatHHMM((min - config.ATTENDANCE_OPEN_BEFORE_MIN + 1440) % 1440)} da ochiladi.`);
  }));

  bot.command('dars_kunlari', groupAdmin(async (ctx) => {
    // Foydalanuvchi uchun 1=Du … 7=Ya; ichkarida 0=Ya … 6=Sh
    const days = [...new Set(ctx.match.split(/[\s,]+/).filter(Boolean).map(Number))];
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return ctx.reply('Masalan: /dars_kunlari 1,3,5  (1=Dushanba … 7=Yakshanba)');
    const g = await GroupChat.findOneAndUpdate({ chat_id: ctx.chat.id, enabled: true }, { $set: { days: days.map((d) => d % 7).sort() } }, { new: true }).lean();
    if (!g) return connectedGroup(ctx);
    return ctx.reply(`✅ Dars kunlari: ${g.days.map((d) => DAY_NAMES[d]).join(', ')}`);
  }));

  bot.command('tolov_sanasi', groupAdmin(async (ctx) => {
    const [d, t] = ctx.match.trim().split(/\s+/);
    const day = Number(d);
    const min = t ? parseHHMM(t) : 10 * 60;
    if (!Number.isInteger(day) || day < 1 || day > 31 || min === null) return ctx.reply('Masalan: /tolov_sanasi 5 10:00  (har oyning 5-kuni soat 10:00 da)');
    const g = await GroupChat.findOneAndUpdate({ chat_id: ctx.chat.id, enabled: true }, { $set: { pay_day: day, pay_time: formatHHMM(min) } }, { new: true }).lean();
    if (!g) return connectedGroup(ctx);
    return ctx.reply(`✅ To'lov hisoboti har oyning ${g.pay_day}-kuni ${g.pay_time} da yuboriladi.` + (day > 28 ? ' (Qisqa oylarda — oyning oxirgi kuni.)' : ''));
  }));

  // Qo'lda: hozirgi holatni darhol guruhga yuborish
  bot.command('davomat', groupAdmin(async (ctx) => {
    const g = await connectedGroup(ctx);
    return g && attendance.postReport(ctx.api, g);
  }));
  bot.command('tolov', groupAdmin(async (ctx) => {
    const g = await connectedGroup(ctx);
    return g && payments.postReport(ctx.api, g);
  }));
}

module.exports = { register };
