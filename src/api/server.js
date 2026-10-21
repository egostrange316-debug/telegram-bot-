const crypto = require('crypto');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config');
const { User } = require('../models/app');
const { TgLink } = require('../models/bot');
const { userResults, leaderboard, isId } = require('../lib/stats');
const { issueLinkCode } = require('../lib/linking');

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
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) return null;
  const hash = params.get('hash');
  if (!/^[a-f\d]{64}$/.test(hash || '')) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = Number(params.get('auth_date'));
  const age = Date.now() / 1000 - authDate;
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || age < -30 || age > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}

async function auth(req, res, next) {
  try {
    let userId = null;
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ') && config.JWT_SECRET) {
      const payload = jwt.verify(h.slice(7), config.JWT_SECRET, { algorithms: ['HS256'] });
      if (!payload.exp) return res.status(401).json({ message: 'Token muddati berilmagan' });
      userId = payload.id;
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
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    const sameHost = origin === `https://${req.get('host')}` || origin === `http://${req.get('host')}`;
    if (origin && !sameHost && !config.CORS_ORIGINS.includes(origin)) return res.status(403).json({ message: 'Ilova domeni CORS_ORIGINS ga kiritilmagan' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Telegram-Init-Data');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.get('/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  app.use('/webapp', express.static(path.join(__dirname, '..', '..', 'public'), { maxAge: '1h' }));

  app.post('/api/telegram/link', auth, wrap(async (req, res) => {
    if (!config.BOT_USERNAME) return res.status(503).json({ message: 'Bot hali ishga tushmagan' });
    const code = await issueLinkCode(req.user._id);
    return res.json({ url: `https://t.me/${config.BOT_USERNAME}?start=link_${code}`, expires_in: 300 });
  }));

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
