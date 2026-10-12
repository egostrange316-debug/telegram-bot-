const { InlineKeyboard } = require('grammy');
const { User, Attendance } = require('../models/app');
const { GroupChat, JobLog } = require('../models/bot');
const { dateKey, humanDate } = require('../lib/time');
const { esc, isAdmin, adminChatIds, actorUserId, safeSend } = require('./common');

/**
 * Davomat ilovadagi `attendances` kolleksiyasiga yoziladi (user + "YYYY-MM-DD") —
 * shuning uchun bot orqali qo'yilgan belgilar ilovaning davomat jadvalida ham ko'rinadi.
 */

/** Guruh o'quvchilari: group_name berilgan bo'lsa shu guruh, aks holda barcha o'quvchilar */
function roster(group) {
  const filter = { role: 'student' };
  if (group.group_name) filter.group_name = group.group_name;
  return User.find(filter).select('full_name group_name status subscription_end_date').sort({ full_name: 1 }).lean();
}

const compact = (key) => key.replace(/-/g, '').slice(2); // 2026-10-12 -> 261012
const expand = (c) => `20${c.slice(0, 2)}-${c.slice(2, 4)}-${c.slice(4, 6)}`;

async function marks(students, date) {
  const rows = await Attendance.find({ user: { $in: students.map((s) => s._id) }, date }).select('user status').lean();
  return new Map(rows.map((r) => [String(r.user), r.status]));
}

const ICON = { present: '✅', absent: '❌' };
const MAX_SHEET = 96;

async function sheet(group, date) {
  const students = await roster(group);
  const m = await marks(students, date);
  const kb = new InlineKeyboard();
  const d = compact(date);
  // Telegram: bitta xabarda 100 tagacha tugma
  students.slice(0, MAX_SHEET).forEach((s, i) => {
    kb.text(`${ICON[m.get(String(s._id))] || '⬜'} ${s.full_name}`.slice(0, 40), `a:${group._id}:${s._id}:${d}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row().text('✅ Qolganlar keldi', `aa:${group._id}:${d}`).text('📤 Guruhga yuborish', `as:${group._id}:${d}`);
  const done = students.filter((s) => m.has(String(s._id))).length;
  const text =
    `📋 <b>Davomat — ${esc(group.title || group.group_name || 'guruh')}</b>\n📅 ${humanDate(date)} · ⏰ ${group.attendance_time}\n\n` +
    `Bosing: ⬜ → ✅ keldi → ❌ kelmadi → ⬜\nBelgilangan: ${done}/${students.length}`;
  return { text, kb, students };
}

/** Darsdan 30 daqiqa oldin: barcha adminlarga belgilash ro'yxati */
async function sendSheetToAdmins(api, group, date = dateKey()) {
  const { text, kb, students } = await sheet(group, date);
  if (!students.length) return;
  for (const id of await adminChatIds()) {
    await safeSend(() => api.sendMessage(id, text, { parse_mode: 'HTML', reply_markup: kb }));
  }
}

/** Dars vaqtida guruhga: kim keldi, kim kelmadi */
async function postReport(api, group, date = dateKey()) {
  const students = await roster(group);
  const m = await marks(students, date);
  const present = students.filter((s) => m.get(String(s._id)) === 'present');
  const absent = students.filter((s) => m.get(String(s._id)) === 'absent');
  const unmarked = students.filter((s) => !m.has(String(s._id)));
  const list = (arr) => (arr.length ? arr.map((s, i) => `${i + 1}. ${esc(s.full_name)}`).join('\n') : '—');
  let text =
    `📋 <b>Davomat — ${humanDate(date)}</b>\n\n` +
    `✅ <b>Kelganlar (${present.length}):</b>\n${list(present)}\n\n` +
    `❌ <b>Kelmaganlar (${absent.length}):</b>\n${list(absent)}`;
  if (unmarked.length) text += `\n\n⬜ <b>Belgilanmagan (${unmarked.length}):</b>\n${list(unmarked)}`;
  return safeSend(() => api.sendMessage(group.chat_id, text, { parse_mode: 'HTML' }));
}

/** Bir martalik ish: kalit allaqachon bo'lsa false (boshqa jarayon/oldin yuborilgan) */
async function claim(key) {
  try {
    await JobLog.create({ key });
    return true;
  } catch (e) {
    if (e.code === 11000) return false;
    throw e;
  }
}

function register(bot) {
  bot.callbackQuery(/^a:([a-f\d]{24}):([a-f\d]{24}):(\d{6})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const [, gid, uid, d] = ctx.match;
    const date = expand(d);
    const group = await GroupChat.findById(gid).lean();
    const student = await User.findOne({ _id: uid, role: 'student' }).select('_id').lean();
    if (!group || !student) return ctx.answerCallbackQuery({ text: 'Topilmadi' });
    const cur = await Attendance.findOne({ user: uid, date }).lean();
    const next = !cur ? 'present' : cur.status === 'present' ? 'absent' : null;
    if (next) await Attendance.updateOne({ user: uid, date }, { $set: { status: next, by: await actorUserId(ctx.from.id) } }, { upsert: true });
    else await Attendance.deleteOne({ user: uid, date });
    await ctx.answerCallbackQuery({ text: next === 'present' ? '✅ Keldi' : next === 'absent' ? '❌ Kelmadi' : '⬜ Belgi olib tashlandi' });
    const { text, kb } = await sheet(group, date);
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
  });

  bot.callbackQuery(/^aa:([a-f\d]{24}):(\d{6})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const group = await GroupChat.findById(ctx.match[1]).lean();
    if (!group) return ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
    const date = expand(ctx.match[2]);
    const students = await roster(group);
    const m = await marks(students, date);
    const by = await actorUserId(ctx.from.id);
    const ops = students
      .filter((s) => !m.has(String(s._id)))
      .map((s) => ({ updateOne: { filter: { user: s._id, date }, update: { $setOnInsert: { status: 'present', by } }, upsert: true } }));
    if (ops.length) await Attendance.bulkWrite(ops);
    await ctx.answerCallbackQuery({ text: `✅ ${ops.length} ta o'quvchi "keldi" deb belgilandi` });
    const { text, kb } = await sheet(group, date);
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
  });

  bot.callbackQuery(/^as:([a-f\d]{24}):(\d{6})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const group = await GroupChat.findById(ctx.match[1]).lean();
    if (!group) return ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
    const date = expand(ctx.match[2]);
    // Qo'lda yuborilsa, belgilangan vaqtda avtomatik qayta yuborilmaydi
    await claim(`att-post:${group.chat_id}:${date}`);
    await postReport(ctx.api, group, date);
    return ctx.answerCallbackQuery({ text: '📤 Guruhga yuborildi' });
  });
}

module.exports = { register, roster, sendSheetToAdmins, postReport, claim, MAX_SHEET };
