require('dotenv').config();
const { mongoUri } = require('./lib/mongo-uri');

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

const config = {
  // Standart: ilovasiz, Telegram orqali ro'yxatdan o'tish.
  STANDALONE: process.env.STANDALONE !== 'false',
  BOT_TOKEN: process.env.BOT_TOKEN,
  // Mustaqil rejimda botning o'z bazasi; eski ilova rejimida ilova bazasi.
  MONGO_URI: mongoUri(),
  // Ilovaning JWT_SECRET'i: ilova tokeni bilan bot API'siga kirish uchun (natijalar, grafik, reyting)
  JWT_SECRET: process.env.JWT_SECRET,
  // ENZO-APP bilan bir xil AI xizmati. Kalit faqat serverda saqlanadi.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_SCREENSHOT_MODEL: process.env.GEMINI_SCREENSHOT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  // Telegram ID'lar (vergul bilan). Ilovada role=admin bo'lgan foydalanuvchi bot orqali kirsa ham admin bo'ladi
  ADMIN_IDS: list(process.env.ADMIN_IDS).map(Number).filter(Number.isFinite),
  PORT: Number(process.env.PORT) || 8080,
  // Mini App (grafik sahifasi) manzili, masalan https://bot.example.uz/webapp — bo'lmasa tugma chiqmaydi
  WEBAPP_URL: process.env.WEBAPP_URL || '',
  BOT_USERNAME: (process.env.BOT_USERNAME || '').replace(/^@/, ''),
  CORS_ORIGINS: list(process.env.CORS_ORIGINS),
  // Botdagi grafik rasmi uchun (Chart.js konfiguratsiyasidan PNG). Bo'sh qoldirilsa rasm yuborilmaydi
  CHART_URL: process.env.CHART_URL === undefined ? 'https://quickchart.io/chart' : process.env.CHART_URL,
  // Davomat ro'yxati admin uchun necha daqiqa oldin ochiladi
  ATTENDANCE_OPEN_BEFORE_MIN: Number(process.env.ATTENDANCE_OPEN_BEFORE_MIN) || 30,
  // Tahlilning eng qisqa uzunligi (belgi)
  MIN_ANALYSIS_CHARS: Number(process.env.MIN_ANALYSIS_CHARS) || 15,
};

module.exports = config;
