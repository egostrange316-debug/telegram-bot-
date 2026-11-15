const { randomBytes } = require('crypto');
const { BioPackage: Package, BioMock: Mock, BioGroup: Group, BioAttempt: Attempt, BioSubmission: Submission } = require('../storage/postgres');
const { InputError, localTime } = require('./domain');
const service = require('./service');
async function savePackage(data, editId) {
  const existing = await Package.findOne({ mock_id:data.mock_id, version:data.version });
  if (editId) {
    if (!existing || existing._id !== editId || existing.status !== 'draft') throw new InputError('Faqat tanlangan qoralamaning aynan shu mock_id/version nusxasini tahrirlang. Tasdiqlangan test uchun yangi version yarating.');
    return Package.findOneAndUpdate({_id:editId,status:'draft'},{$set:data},{new:true});
  }
  if (existing) throw new InputError(`${data.mock_id} v${data.version} allaqachon bor. Yangi version kiriting yoki qoralamani «Tahrirlash» orqali yangilang.`);
  try { return await Package.create(data); }
  catch(e) { if(e.code===11000) throw new InputError('Bu MOCK ID va versiya allaqachon bor.'); throw e; }
}
function publicMock(m) {
  return { run_id:m._id, mock_id:m.external_mock_id, version:m.version, title:m.title, grade:m.grade, topics:m.topics,
    question_count:m.count, starts_at:m.starts_at, ends_at:m.ends_at,
    questions:m.questions.map(q=>({question_id:q.question_id,source_topic:q.source_topic,source_question_number:q.source_question_number,text:q.text,
      options:{A:q.options.A,B:q.options.B,C:q.options.C,D:q.options.D}})) };
}
function reviewReady(m, now = Date.now()) {
  const end = new Date(m?.ends_at).getTime();
  return ['open', 'closed'].includes(m?.status) && Number.isFinite(end) && end <= now;
}
async function reviewForUser(user, runId) {
  const m = await Mock.findById(runId);
  const submission = m && await Submission.findOne({ mock_id: m._id, telegram_id: user.id });
  if (!submission) throw new InputError('Bu test uchun o‘zingiz topshirgan natija topilmadi.');
  if (!reviewReady(m)) throw new InputError(`Tahlil testning umumiy vaqti tugagach ochiladi: ${localTime(m.ends_at)} (Toshkent).`);
  if (submission.answers?.length !== m.count || m.answer_key?.length !== m.count) throw new InputError('Bu eski natijaning javoblari to‘liq saqlanmagan.');
  // Only a participant's own accepted submission is readable. Never begin an
  // attempt, enroll, consume retake permission, or change scores in this path.
  const questions = Array.from({ length: m.count }, (_, i) => {
    const q = m.questions?.[i], selected = submission.answers[i];
    return { question_id: q?.question_id || String(i + 1), number: i + 1,
      source_topic: q?.source_topic || '', text: q?.text || 'Savol matni guruhga yuborilgan test faylida.',
      options: q ? { A:q.options.A, B:q.options.B, C:q.options.C, D:q.options.D } : null,
      selected_answer: selected, correct_answer: m.answer_key[i], is_correct: selected === m.answer_key[i] };
  });
  return { mock: { run_id:m._id, mock_id:m.external_mock_id || m.code, version:m.version || 1, title:m.title,
    question_count:m.count, ends_at:m.ends_at },
    result: { correct:submission.correct, total:submission.total, percent:submission.percent, blank:submission.blank,
      submitted_at:submission.submitted_at }, questions };
}
async function openForUser(api,user,runId) {
  const m = await Mock.findById(runId);
  if (!m?.questions || m.status!=='open' || new Date(m.starts_at)>new Date() || new Date(m.ends_at)<=new Date()) throw new InputError('Test boshlanmagan, muddati tugagan yoki bu faylli mock.');
  await service.enroll(api,user,await Group.findById(m.group_id));
  const attempt=service.accepted(await service.begin(m,user));
  return { m, attempt };
}
async function permitRetake(code,userId) {
  const m=await Mock.findOne({code,status:'open'});
  if (!m || new Date(m.ends_at)<=new Date()) throw new InputError('Ochiq mock kodini kiriting.');
  const s=await Submission.findOne({mock_id:m._id,telegram_id:userId});
  if (!s) throw new InputError('Bu o‘quvchi hali topshirmagan.');
  if ((s.generation || 1)>=5) throw new InputError('Bir mockda eng ko‘pi 5 ta urinish.');
  await Attempt.findOneAndUpdate({mock_id:m._id,telegram_id:userId},{$set:{retake_allowed:true},$setOnInsert:{state:'submitted',generation:1}},{upsert:true,new:true});
  return m;
}
function snapshot(p) {
  if (!p || p.status!=='approved') throw new InputError('MOCK avval tasdiqlansin.');
  return { package_id:p._id,external_mock_id:p.mock_id,version:p.version,title:p.title,count:p.question_count,questions:p.questions,
    question_ids:p.questions.map(q=>q.question_id),grade:p.grade,topics:p.topics,answer_key:p.answer_key,materials:[] };
}
module.exports={savePackage,publicMock,openForUser,permitRetake,snapshot,reviewReady,reviewForUser};
