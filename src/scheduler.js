const config = require('./config');
const { GroupChat } = require('./models/bot');
const { tashkentParts, dateKey, parseHHMM, effectivePayDay } = require('./lib/time');
const attendance = require('./bot/attendance');
const payments = require('./bot/payments');

// Bot qisqa vaqt o'chib qolsa ham, vaqti o'tgan xabar shu oraliq ichida baribir yuboriladi
const CATCH_UP_MIN = 20;

const due = (nowMin, target) => target !== null && nowMin >= target && nowMin < target + CATCH_UP_MIN;

/**
 * Har daqiqada (Toshkent vaqti):
 *  - davomat vaqtidan 30 daqiqa oldin — adminlarga belgilash ro'yxati;
 *  - davomat vaqtida — guruhga "kim keldi / kim kelmadi";
 *  - oyning to'lov sanasida — guruhga "kim to'ladi / kim to'lamadi" (adminga — to'lamaganlar tugmalar bilan).
 * Har biri JobLog orqali bir marta yuboriladi (qayta ishga tushganda takrorlanmaydi).
 */
async function tick(api, now = new Date()) {
  const p = tashkentParts(now);
  const today = dateKey(now);
  const groups = await GroupChat.find({ enabled: true }).lean();
  for (const g of groups) {
    try {
      if (g.days.includes(p.weekday)) {
        const at = parseHHMM(g.attendance_time);
        const open = at === null ? null : Math.max(0, at - config.ATTENDANCE_OPEN_BEFORE_MIN);
        if (due(p.minutes, open) && p.minutes < at && (await attendance.claim(`att-open:${g.chat_id}:${today}`))) {
          await attendance.sendSheetToAdmins(api, g, today);
        }
        if (due(p.minutes, at) && (await attendance.claim(`att-post:${g.chat_id}:${today}`))) {
          await attendance.postReport(api, g, today);
        }
      }
      const payDay = effectivePayDay(g.pay_day, p.year, p.month);
      if (p.day === payDay && due(p.minutes, parseHHMM(g.pay_time)) && (await attendance.claim(`pay:${g.chat_id}:${today.slice(0, 7)}`))) {
        await payments.postReport(api, g);
        await payments.sendUnpaidToAdmins(api, g);
      }
    } catch (e) {
      console.error(`Rejalashtiruvchi xatosi (guruh ${g.chat_id}):`, e);
    }
  }
}

function startScheduler(api) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick(api);
    } catch (e) {
      console.error('Rejalashtiruvchi xatosi:', e);
    } finally {
      running = false;
    }
  };
  run();
  return setInterval(run, 30 * 1000);
}

module.exports = { startScheduler, tick };
