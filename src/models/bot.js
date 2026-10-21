const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

/** Telegram akkaunt <-> ilova foydalanuvchisi. Bitta Telegram = bitta o'quvchi. */
const TgLink = mongoose.model(
  'TgLink',
  new mongoose.Schema(
    {
      telegram_id: { type: Number, required: true, unique: true },
      user: { type: ObjectId, ref: 'User', required: true },
      username: String,
    },
    { timestamps: true, collection: 'bot_tg_links' }
  ).index({ user: 1 }, { unique: true, name: 'one_telegram_account_per_user' })
);

/**
 * Test (IELTS yoki CEFR, Reading/Listening/Writing). Admin bo'lib-bo'lib joylaydi.
 * materials — Telegram file_id'lar (audio, PDF, rasm) va matnlar, joylangan tartibda yuboriladi.
 * answer_key — Reading/Listening uchun to'g'ri javoblar (har biri bir nechta variant bo'lishi mumkin).
 */
const Test = mongoose.model(
  'Test',
  new mongoose.Schema(
    {
      exam: { type: String, enum: ['ielts', 'cefr'], required: true },
      section: { type: String, enum: ['reading', 'listening', 'writing'], required: true },
      title: { type: String, required: true, trim: true },
      order: { type: Number, required: true },
      materials: [
        {
          _id: false,
          kind: { type: String, enum: ['text', 'audio', 'voice', 'document', 'photo', 'video'] },
          file_id: String,
          text: String,
        },
      ],
      answer_key: { type: [[String]], default: [] },
      max_score: Number, // Writing: IELTS 9 (band), CEFR 75
      active: { type: Boolean, default: true },
    },
    { timestamps: true, collection: 'bot_tests' }
  ).index({ exam: 1, section: 1, order: 1 })
);

/**
 * Test natijasi. status:
 *  - 'grading'  — Writing topshirildi, admin baholashini kutyapti
 *  - 'analysis' — natija chiqdi, o'quvchi xatolarini tahlil qilishi SHART (aks holda keyingi test ochilmaydi)
 *  - 'done'     — tahlil tugadi
 */
const Attempt = mongoose.model(
  'Attempt',
  new mongoose.Schema(
    {
      user: { type: ObjectId, ref: 'User', required: true },
      test: { type: ObjectId, ref: 'Test', required: true },
      exam: { type: String, enum: ['ielts', 'cefr'], required: true },
      section: { type: String, enum: ['reading', 'listening', 'writing'], required: true },
      status: { type: String, enum: ['grading', 'analysis', 'done'], required: true },
      submission_id: { type: String },
      pending: { type: Boolean, default: false },
      correct: Number,
      total: Number,
      score: Number, // Writing balli (IELTS band yoki CEFR ball)
      max_score: Number,
      percent: Number, // 0..100 — grafik va reyting uchun yagona o'lchov
      band: Number, // IELTS band (taxminiy, Reading/Listening uchun xom balldan)
      level: String, // CEFR darajasi (taxminiy)
      answers: [String],
      mistakes: [{ _id: false, q: Number, given: String, correct: String, analysis: String }],
      writing: { _id: false, text: String, file_id: String, kind: String },
      feedback: String,
      analysis: String, // Writing: o'quvchining umumiy tahlili
      graded_by: { type: ObjectId, ref: 'User' },
      finished_at: Date,
    },
    { timestamps: true, collection: 'bot_attempts' }
  )
    .index({ user: 1, exam: 1, createdAt: 1 })
    .index({ user: 1, test: 1 })
    .index({ submission_id: 1 }, { unique: true, sparse: true })
    .index({ user: 1 }, { unique: true, partialFilterExpression: { pending: true } })
    .index({ status: 1 })
);

/**
 * Bot ulangan Telegram guruh. group_name — ilovadagi guruh nomi (bo'sh bo'lsa barcha o'quvchilar).
 * Vaqtlar Toshkent bo'yicha "HH:MM". days: 0=Yakshanba .. 6=Shanba.
 */
const GroupChat = mongoose.model(
  'GroupChat',
  new mongoose.Schema(
    {
      chat_id: { type: Number, required: true, unique: true },
      title: String,
      group_name: { type: String, default: null },
      attendance_time: { type: String, default: '14:00' },
      days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
      pay_day: { type: Number, default: 1, min: 1, max: 31 },
      pay_time: { type: String, default: '10:00' },
      enabled: { type: Boolean, default: true },
    },
    { timestamps: true, collection: 'bot_groups' }
  )
);

/** Rejalashtirilgan xabar bir marta yuborilishi uchun (qayta ishga tushganda ham takrorlanmaydi). */
const JobLog = mongoose.model(
  'JobLog',
  new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true },
      state: { type: String, enum: ['running', 'done', 'failed'] },
      owner: String,
      lease_until: Date,
      completed_at: Date,
    },
    { timestamps: true, collection: 'bot_job_logs' }
  )
);

const BotSession = mongoose.model('BotSession', new mongoose.Schema({
  telegram_id: { type: Number, required: true, unique: true },
  data: mongoose.Schema.Types.Mixed,
  expires_at: { type: Date, expires: 0 },
}, { collection: 'bot_sessions' }));

const LinkCode = mongoose.model('LinkCode', new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  user: { type: ObjectId, ref: 'User', required: true, unique: true },
  expires_at: { type: Date, expires: 0 },
}, { collection: 'bot_link_codes' }));

module.exports = { TgLink, Test, Attempt, GroupChat, JobLog, BotSession, LinkCode };
