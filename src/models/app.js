const mongoose = require('mongoose');
const config = require('../config');

/**
 * Standalone: bot_students / bot_attendances. Ilova akkaunti va paroli kerak emas.
 * Faqat STANDALONE=false rejimida eski ENZO users / attendances kolleksiyalari ishlatiladi.
 */
const userSchema = new mongoose.Schema(
  {
    full_name: String,
    name_key: String,
    password_hash: String,
    role: String,
    group_name: String,
    telegram_id: Number,
    group_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GroupChat' }],
    status: String,
    subscription_end_date: Date,
    payments: { type: Array, default: undefined },
  },
  { strict: false, timestamps: true, collection: config.STANDALONE ? 'bot_students' : 'users' }
);
if (config.STANDALONE) userSchema.index({ telegram_id: 1 }, { unique: true, sparse: true });

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ['present', 'absent'], required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { strict: false, timestamps: true, collection: config.STANDALONE ? 'bot_attendances' : 'attendances' }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

/** Ilovadagi bilan bir xil: kichik harf, bo'shliqlar birlashtirilgan */
User.nameKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

module.exports = { User, Attendance };
