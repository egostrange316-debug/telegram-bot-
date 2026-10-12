const crypto = require('crypto');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models/app');
const { TgLink } = require('../models/bot');
const { userResults, leaderboard, isId } = require('../lib/stats');

/**
 * Ilova va Telegram Mini App uchun API.
 *
 * Avtorizatsiya (ikkalasidan biri):
 *  - `Authorization: Bearer <ilova tokeni>` — ilovaning o'z JWT'i (bir xil JWT_SECRET), ilovadan to'g'ridan-to'g'ri chaqirish uchun;
 *  - `X-Telegram-Init-Data: <Telegram.WebApp.initData>` — bot ichidagi Mini App (grafik sahifasi) uchun.
 */

/** Telegram Mini App initData imzosini tekshirish (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
function verifyInitData(initData, botToken, maxAgeSec = 24 * 3600) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}

async function auth(req, res, next) {
  try {
    let userId = null;
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ') && config.JWT_SECRET) {
      userId = jwt.verify(h.slice(7), config.JWT_SECRET).id;
    } else if (req.headers['x-telegram-init-data']) {
      const tg = verifyInitData(req.headers['x-telegram-init-data'], config.BOT_TOKEN);
      const link = tg && (await TgLink.findOne({ telegram_id: tg.id }).lean());
      if (link) userId = link.user;
    }
    const user = userId && isId(String(userId)) ? await User.findById(userId).select('full_name role group_name').lean() : null;
    if (!user) return res.status(401).json({ message: 'Avtorizatsiya talab qilinadi' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Token yaroqsiz yoki muddati o'tgan" });
  }
}

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const examParam = (req, res) => {
  const exam = String(req.query.exam || 'ielts').toLowerCase();
  if (!['ielts', 'cefr'].includes(exam)) {
    res.status(400).json({ message: "exam faqat 'ielts' yoki 'cefr'" });
    return null;
  }
  return exam;
};

function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Telegram-Init-Data');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/webapp', express.static(path.join(__dirname, '..', '..', 'public'), { maxAge: '1h' }));

  /** O'z natijalari (grafik uchun). Admin `user_id` bilan istalgan o'quvchinikini ko'radi */
  app.get('/api/exams/results', auth, wrap(async (req, res) => {
    const exam = examParam(req, res);
    if (!exam) return null;
    let target = req.user;
    if (req.query.user_id) {
      if (req.user.role !== 'admin' && String(req.query.user_id) !== String(req.user._id)) return res.status(403).json({ message: 'Faqat Admin' });
      if (!isId(String(req.query.user_id))) return res.status(400).json({ message: "user_id noto'g'ri" });
      target = await User.findById(req.query.user_id).select('full_name role group_name').lean();
      if (!target) return res.status(404).json({ message: "O'quvchi topilmadi" });
    }
    const r = await userResults(target._id, exam);
    return res.json({ student: { id: String(target._id), full_name: target.full_name, group_name: target.group_name || null }, ...r });
  }));

  /** Butun o'quv markaz reytingi (barcha o'quvchilar ko'radi) */
  app.get('/api/exams/leaderboard', auth, wrap(async (req, res) => {
    const exam = examParam(req, res);
    if (!exam) return null;
    const board = await leaderboard(exam);
    return res.json({ exam, me: String(req.user._id), leaderboard: board });
  }));

  /** Ilova bosh sahifasi uchun qisqa: ikkala imtihon bo'yicha o'rtacha va o'sish yo'nalishi */
  app.get('/api/exams/summary', auth, wrap(async (req, res) => {
    const out = {};
    for (const exam of ['ielts', 'cefr']) {
      const r = await userResults(req.user._id, exam);
      out[exam] = { tests: r.items.length, average_percent: r.average_percent, trend: r.trend, last: r.items[r.items.length - 1] || null };
    }
    return res.json(out);
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('API xatosi:', err);
    res.status(500).json({ message: 'Server xatosi' });
  });
  return app;
}

module.exports = { createServer, verifyInitData };
