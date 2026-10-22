const { InlineKeyboard } = require('grammy');
const { User, Attendance } = require('../models/app');
const { GroupChat, ScreenshotResult, AttendanceReport } = require('../models/bot');
const { scoreLabel } = require('../lib/screenshot-reader');
const { EXAM_NAMES, SECTION_NAMES } = require('../lib/stats');
const { rosterFilter } = require('../lib/enrollment');
const { dateKey, humanDate } = require('../lib/time');
const { esc, isAdmin, adminChatIds, actorUserId } = require('./common');
const { deliverOnce, sendReport } = require('../lib/delivery');

function roster(group) {
  const filter = rosterFilter(group);
  return User.find(filter).select('full_name group_name status subscription_end_date').sort({ full_name: 1, _id: 1 }).lean();
}
const compact = (key) => key.replace(/-/g, '').slice(2);
const expand = (c) => `20${c.slice(0, 2)}-${c.slice(2, 4)}-${c.slice(4, 6)}`;
const ICON = { present: '✅', absent: '❌' };
const MAX_SHEET = 40;

async function marks(students, date) {
  const rows = await Attendance.find({ user: { $in: students.map((s) => s._id) }, date }).select('user status').lean();
  return new Map(rows.map((r) => [String(r.user), r.status]));
}

async function sheet(group, date, requestedPage = 0) {
  const students = await roster(group);
  const m = await marks(students, date);
  const pages = Math.max(1, Math.ceil(students.length / MAX_SHEET));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pages - 1);
  const kb = new InlineKeyboard();
  const d = compact(date);
  students.slice(page * MAX_SHEET, (page + 1) * MAX_SHEET).forEach((s, i) => {
    kb.text(`${ICON[m.get(String(s._id))] || '⬜'} ${s.full_name}`.slice(0, 40), `a:${group._id}:${s._id}:${d}:${page}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row();
  if (page > 0) kb.text('⬅️', `ap:${group._id}:${d}:${page - 1}`);
  if (page + 1 < pages) kb.text('➡️', `ap:${group._id}:${d}:${page + 1}`);
  kb.row().text('✅ Qolganlar keldi', `aa:${group._id}:${d}:${page}`)
    .text('📤 Guruhga yuborish', `as:${group._id}:${d}`);
  const done = students.filter((s) => m.has(String(s._id))).length;
  const text = `📋 <b>Davomat — ${esc((group.title || group.group_name || 'guruh').slice(0, 100))}</b>\n` +
    `📅 ${humanDate(date)} · ⏰ ${group.attendance_time}\n\n` +
    `Bosing: ⬜ → ✅ keldi → ❌ kelmadi → ⬜\nBelgilangan: ${done}/${students.length} · Sahifa ${page + 1}/${pages}`;
  return { text, kb, students };
}

async function sendSheetToAdmins(api, group, date = dateKey(), key) {
  const { text, kb, students } = await sheet(group, date);
  if (!students.length) return;
  const failures = [];
  for (const id of await adminChatIds()) {
    try {
      const send = () => api.sendMessage(id, text, { parse_mode: 'HTML', reply_markup: kb });
      if (key) await deliverOnce(`${key}:${id}`, send);
      else await send();
    } catch (error) { failures.push(error); }
  }
  if (failures.length) throw failures[0];
}

async function postReport(api, group, date = dateKey(), key) {
  let snapshot = key ? await AttendanceReport.findOne({ key }).lean() : null;
  if (!snapshot) {
    const built = await buildReport(group, date);
    if (key) {
      try {
        snapshot = await AttendanceReport.findOneAndUpdate({ key }, { $setOnInsert: {
          ...built, expires_at: new Date(Date.now() + 14 * 86400_000),
        } }, { upsert: true, new: true }).lean();
      } catch (error) {
        if (error.code !== 11000) throw error;
        snapshot = await AttendanceReport.findOne({ key }).lean();
      }
    } else snapshot = built;
  }
  await sendReport(api, group.chat_id, snapshot.text, key);
  // Results arriving after the snapshot or after today's send remain queued for the next report.
  if (snapshot.result_ids.length) await ScreenshotResult.updateMany({ _id: { $in: snapshot.result_ids } }, {
    $addToSet: { report_chats: group.chat_id },
  });
}

function screenshotLines(rows, students) {
  const names = new Map(students.map(s => [String(s._id), s.full_name]));
  return rows.map((r, i) => `${i + 1}. ${esc(String(names.get(String(r.user)) || 'O‘quvchi').slice(0, 150))}` +
    ` — ${EXAM_NAMES[r.exam]} ${SECTION_NAMES[r.section]}: <b>${scoreLabel(r)}</b>` +
    ` · ${esc(r.title)} · ${humanDate(dateKey(new Date(r.accepted_at)))}`).join('\n');
}

async function buildReport(group, date) {
  const students = await roster(group);
  const m = await marks(students, date);
  const present = students.filter((s) => m.get(String(s._id)) === 'present');
  const absent = students.filter((s) => m.get(String(s._id)) === 'absent');
  const unmarked = students.filter((s) => !m.has(String(s._id)));
  const list = (arr) => arr.length ? arr.map((s, i) => `${i + 1}. ${esc(String(s.full_name).slice(0, 150))}`).join('\n') : '—';
  let text = `📋 <b>Davomat — ${humanDate(date)}</b>\n\n` +
    `✅ <b>Kelganlar (${present.length}):</b>\n${list(present)}\n\n` +
    `❌ <b>Kelmaganlar (${absent.length}):</b>\n${list(absent)}`;
  if (unmarked.length) text += `\n\n⬜ <b>Belgilanmagan (${unmarked.length}):</b>\n${list(unmarked)}`;
  const results = await ScreenshotResult.find({ user: { $in: students.map(s => s._id) },
    status: 'accepted', report_chats: { $ne: group.chat_id }, accepted_at: { $lte: new Date() },
  }).select('user exam section title score_type score maximum accepted_at').sort({ accepted_at: 1, _id: 1 }).lean();
  if (results.length) text += `\n\n📷 <b>Skrinshot natijalari (${results.length})</b>\n` +
    'AI rasmdagi ballni o‘qidi; o‘quvchi tasdiqladi.\n' + screenshotLines(results, students);
  return { text, result_ids: results.map(r => r._id) };
}

async function refresh(ctx, group, date, page = 0) {
  const { text, kb } = await sheet(group, date, page);
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }).catch((error) => {
    if (!String(error.description).includes('message is not modified')) throw error;
  });
}

function register(bot) {
  bot.callbackQuery(/^ap:([a-f\d]{24}):(\d{6}):(\d{1,5})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const group = await GroupChat.findOne({ _id: ctx.match[1], enabled: true }).lean();
    await ctx.answerCallbackQuery();
    if (group) return refresh(ctx, group, expand(ctx.match[2]), Number(ctx.match[3]));
    return null;
  });
  bot.callbackQuery(/^a:([a-f\d]{24}):([a-f\d]{24}):(\d{6})(?::(\d{1,5}))?$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const [, gid, uid, d, page = 0] = ctx.match;
    const date = expand(d);
    const group = await GroupChat.findOne({ _id: gid, enabled: true }).lean();
    if (!group) return ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
    const student = await User.findOne({ _id: uid, ...rosterFilter(group) }).select('_id').lean();
    if (!student) return ctx.answerCallbackQuery({ text: 'O‘quvchi bu guruhda emas' });
    const cur = await Attendance.findOne({ user: uid, date }).lean();
    const next = !cur ? 'present' : cur.status === 'present' ? 'absent' : null;
    if (!cur) {
      try { await Attendance.create({ user: uid, date, status: next, by: await actorUserId(ctx.from.id) }); }
      catch (error) { if (error.code !== 11000) throw error; }
    } else if (next) {
      await Attendance.updateOne({ _id: cur._id, status: cur.status }, { $set: { status: next, by: await actorUserId(ctx.from.id) } });
    } else await Attendance.deleteOne({ _id: cur._id, status: cur.status });
    await ctx.answerCallbackQuery();
    return refresh(ctx, group, date, Number(page));
  });
  bot.callbackQuery(/^aa:([a-f\d]{24}):(\d{6})(?::(\d{1,5}))?$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const group = await GroupChat.findOne({ _id: ctx.match[1], enabled: true }).lean();
    if (!group) return ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
    const date = expand(ctx.match[2]);
    const students = await roster(group);
    const by = await actorUserId(ctx.from.id);
    const ops = students.map((s) => ({ updateOne: { filter: { user: s._id, date },
      update: { $setOnInsert: { status: 'present', by } }, upsert: true } }));
    if (ops.length) await Attendance.bulkWrite(ops, { ordered: false });
    await ctx.answerCallbackQuery({ text: '✅ Belgilanmaganlar keldi deb saqlandi' });
    return refresh(ctx, group, date, Number(ctx.match[3] || 0));
  });
  bot.callbackQuery(/^as:([a-f\d]{24}):(\d{6})$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Faqat admin' });
    const group = await GroupChat.findOne({ _id: ctx.match[1], enabled: true }).lean();
    if (!group) return ctx.answerCallbackQuery({ text: 'Guruh topilmadi' });
    await ctx.answerCallbackQuery();
    await postReport(ctx.api, group, expand(ctx.match[2]));
    return ctx.reply('📤 Davomat guruhga yuborildi.');
  });
}

module.exports = { register, roster, sheet, sendSheetToAdmins, postReport, buildReport, screenshotLines, MAX_SHEET };
