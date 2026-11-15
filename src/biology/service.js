const { randomBytes } = require('crypto');
const config = require('../config');
const { BioProfile: Profile, BioGroup: Group, BioMock: Mock, BioSubmission: Submission, JobLog, submitBiology, beginBiology } = require('../storage/postgres');
const { deliverOnce, sendReport } = require('../lib/delivery');
const { sendMaterial } = require('../bot/common');
const { InputError, esc, answerText, localTime, latestSlot, weekStart, rank, isMember, DAY } = require('./domain');
const ownerId = () => config.ADMIN_IDS[0];
const isOwner = id => Number.isSafeInteger(id) && id === ownerId();
const fullName = user => [user.first_name, user.last_name].filter(Boolean).join(' ').replace(/[\x00-\x1f]/g, ' ').slice(0, 100) || 'O‘quvchi';
async function profile(user) {
  return Profile.findOneAndUpdate({ telegram_id: user.id }, { $setOnInsert: { name: fullName(user), mode: isOwner(user.id) ? 'admin' : 'student' } }, { upsert: true, new: true }).lean();
}
async function enroll(api, user, group) {
  if (!group?.enabled) throw new InputError('Guruh ulanmagan yoki ulanish o‘chirilgan.');
  let member;
  try { member = await api.getChatMember(group.chat_id, user.id); } catch { throw new InputError('Guruh a’zoligini tekshirib bo‘lmadi. Bot guruhda admin bo‘lsin.'); }
  if (!isMember(member)) throw new InputError('Avval shu Telegram guruhiga qo‘shiling.');
  await profile(user);
  await Profile.updateOne({ telegram_id: user.id }, { $addToSet: { group_ids: group._id } });
  await Mock.updateMany({ group_id: group._id, status: { $in: ['opening', 'open'] } }, { $addToSet: { roster: user.id } });
}
async function delivered(key, send) {
  if (await deliverOnce(key, send)) return true;
  const log = await JobLog.findOne({ key });
  return Boolean(log && (!log.state || log.state === 'done'));
}
async function begin(mock, user) {
  return beginBiology({ p_mock_id: mock._id, p_telegram_id: user.id, p_new_id: randomBytes(12).toString('hex'), p_nonce: randomBytes(16).toString('hex') });
}
function accepted(result) {
  if (!result.ok) throw new InputError(({closed:'Mock boshlanmagan yoki muddati tugagan.',membership:'Guruh a’zoligi tasdiqlanmadi.',already:'Siz topshirgansiz. Qayta topshirishga admin ruxsati kerak.',stale:'Bu urinish eskirgan. Mockni botdan qayta oching.'})[result.reason] || 'Javob qabul qilinmadi.');
  return result;
}
async function accept(mock, user, answers, nonce) {
  if (!nonce) { const attempt = await begin(mock,user); if (!attempt.ok) return attempt; nonce = attempt.nonce; }
  return submitBiology({ p_mock_id: mock._id, p_telegram_id: user.id, p_answers: answers, p_new_id: randomBytes(12).toString('hex'), p_nonce: nonce });
}
async function openMock(api, group, mock, now) {
  if (mock.status === 'scheduled') {
    const members = await Profile.find({ group_ids: group._id }).select('telegram_id');
    const changed = await Mock.findOneAndUpdate({ _id: mock._id, status: 'scheduled' }, { $set: { status: 'opening', roster: members.map(p => p.telegram_id) } }, { new: true });
    if (!changed) return;
    mock = changed;
  }
  if (now >= new Date(mock.ends_at)) return;
  for (const [i, material] of mock.materials.entries()) {
    if (!await delivered(`bio:open:${mock._id}:file:${i}`, () => sendMaterial(api, group.chat_id, material))) return;
  }
  const link = `https://t.me/${config.BOT_USERNAME}?start=m_${mock.code}`;
  const text = `🧬 <b>${esc(mock.title)}</b> · #${mock.code}\n${mock.count} savol · har to‘g‘ri javob 1 ball\n` +
    `🕒 ${localTime(mock.starts_at)} — ${localTime(mock.ends_at)} (Toshkent)\n\n` +
    `Barcha qatnashchilar topshirishi kerak. Botga yoki shu xabarga javob qilib A/B/C/D javoblaringizni yuboring.\n` +
    `Matn: <code>/javob ${mock.code} 1A 2B 3C …</code>\nRasm: raqamlar va belgilangan javoblar aniq ko‘rinsin.\n` +
    `Guruh natijalari muddat tugagach chiqadi. Qayta topshirish faqat admin ruxsati bilan.`;
  if (!await delivered(`bio:open:${mock._id}:notice`, async () => {
    const msg = await api.sendMessage(group.chat_id, text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: '📝 Botda javob topshirish', url: link }], [{ text: '🙋 Qatnashaman', callback_data: `bj:${group._id}` }],
    ] } });
    await Mock.updateOne({ _id: mock._id }, { $set: { announcement_id: msg.message_id } });
  })) return;
  await Mock.updateOne({ _id: mock._id, status: 'opening' }, { $set: { status: 'open' } });
}
async function weeklyRows(groupId, date) {
  const start = weekStart(date), end = new Date(start.getTime() + 7 * DAY);
  const mocks = await Mock.find({ group_id: groupId, status: 'closed', ends_at: { $gte: start, $lt: end } });
  const rows = await Submission.find({ mock_id: { $in: mocks.map(m => m._id) } });
  const sums = new Map();
  for (const row of rows) {
    const sum = sums.get(row.telegram_id) || { name: row.name, correct: 0, total: 0, tests: 0 };
    sum.correct += row.correct; sum.total += row.total; sum.tests++; sums.set(row.telegram_id, sum);
  }
  return { start, rows: rank([...sums.values()]) };
}
async function weeklyText(groupId, date) {
  const { start, rows } = await weeklyRows(groupId, date);
  return `🏆 <b>Haftalik reyting — ${localTime(start).slice(0, 10)}</b>\nTo‘g‘ri javoblar yig‘indisi; teng ball — teng o‘rin.\n\n` +
    (rows.map(r => `${r.place}. ${esc(r.name)} — <b>${r.correct}/${r.total}</b> · ${r.tests} mock`).join('\n') || 'Hali yakunlangan natija yo‘q.');
}
async function resultsText(mock) {
  const submissions = await Submission.find({ mock_id: mock._id });
  const submitted = new Set(submissions.map(s => s.telegram_id));
  const absentIds = mock.roster.filter(id => !submitted.has(id));
  const profiles = await Profile.find({ telegram_id: { $in: absentIds } });
  const names = new Map(profiles.map(p => [p.telegram_id, p.name]));
  return `✅ <b>${esc(mock.title)} — yakunlandi</b> · #${mock.code}\n` +
    `Topshirdi: ${submissions.length}/${mock.roster.length}\n\n🏅 <b>Mock reytingi:</b>\n` +
    (rank(submissions).map(s => `${s.place}. ${esc(s.name)} — <b>${s.correct}/${s.total}</b> (${s.percent}%)`).join('\n') || 'Hech kim topshirmadi.') +
    `\n\n❌ <b>Topshirmaganlar (${absentIds.length}):</b>\n` +
    (absentIds.map(id => esc(names.get(id) || `ID ${id}`)).join('\n') || 'Barcha ro‘yxatdagi qatnashchilar topshirdi.') +
    '\n\nRo‘yxat guruhda «Qatnashaman» bosgan a’zolar asosida tuzilgan. Shaxsiy xatolar: bot → Natijalarim.';
}
async function closeMock(api, group, mock, now) {
  if (mock.status === 'open') {
    mock = await Mock.findOneAndUpdate({ _id: mock._id, status: 'open', ends_at: { $lte: now } }, { $set: { status: 'closed', closed_at: now } }, { new: true });
    if (!mock) return;
  }
  if (!mock.report_text) {
    const report_text = await resultsText(mock), weekly_text = await weeklyText(group._id, new Date(mock.ends_at));
    mock = await Mock.findOneAndUpdate({ _id: mock._id, status: 'closed', report_text: { $exists: false } }, { $set: { report_text, weekly_text } }, { new: true }) || await Mock.findById(mock._id);
  }
  if (!await sendReport(api, group.chat_id, mock.report_text, `bio:result:${mock._id}`)) return;
  if (!await sendReport(api, group.chat_id, mock.weekly_text, `bio:weekly:${mock._id}`)) return;
  await Mock.updateOne({ _id: mock._id }, { $set: { reported: true } });
}
async function tick(api, now = new Date()) {
  const groups = await Group.find({ enabled: true });
  for (const group of groups) {
    try {
      if (group.weekly_enabled) {
        const slot = latestSlot(group, now), end = new Date(slot.getTime() + group.duration * 60_000);
        if (now < end && !await Mock.exists({ group_id: group._id, weekly_slot: slot.toISOString() })) {
          const queued = await Mock.find({ group_id: group._id, status: 'queued', count: 50 }).sort({ createdAt: 1, _id: 1 }).limit(1);
          if (queued.length) await Mock.updateOne({ _id: queued[0]._id, status: 'queued' }, { $set: { status: 'scheduled', weekly_slot: slot.toISOString(), starts_at: slot, ends_at: end } });
          else await delivered(`bio:empty:${group._id}:${slot.toISOString()}`, () => api.sendMessage(ownerId(), `⚠️ ${group.title}: bu hafta uchun 50 savollik tayyor mock navbatda yo‘q. Admin menyusidan yuklang.`));
        }
      }
      const mocks = await Mock.find({ group_id: group._id, status: { $in: ['scheduled', 'opening', 'open', 'closed'] }, reported: { $ne: true } }).sort({ starts_at: 1 });
      for (let mock of mocks) {
        if (['scheduled', 'opening'].includes(mock.status) && new Date(mock.starts_at) <= now) {
          if (new Date(mock.ends_at) <= now) {
            await Mock.updateOne({ _id: mock._id, status: mock.status }, { $set: { status: 'missed' } });
            await delivered(`bio:missed:${mock._id}`, () => api.sendMessage(ownerId(), `⚠️ ${mock.title}: yuborish muddati o‘tib ketdi. Yangi mock sifatida qayta rejalashtiring.`));
          } else await openMock(api, group, mock, now);
        }
        mock = await Mock.findById(mock._id);
        if (mock.status === 'open' && now < new Date(mock.ends_at) && new Date(mock.ends_at) - now <= 10 * 60_000) {
          const submitted = await Submission.countDocuments({ mock_id: mock._id });
          await delivered(`bio:remind:${mock._id}`, () => api.sendMessage(group.chat_id,
            `⏳ ${mock.title} (#${mock.code}): ${localTime(mock.ends_at)} da qabul yopiladi. Topshirdi: ${submitted}/${mock.roster.length}. Javoblaringizni yuborib, tasdiqlang.`));
        }
        if (mock.status === 'open' && new Date(mock.ends_at) <= now || mock.status === 'closed') await closeMock(api, group, mock, now);
      }
    } catch (e) { console.error('Biology schedule failed', group._id, e.code || 'delivery'); }
  }
}
module.exports = { ownerId, isOwner, profile, enroll, begin, accepted, accept, delivered, tick, weeklyText, resultsText, closeMock, openMock };
