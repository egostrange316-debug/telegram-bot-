const config = require('./config');
const { GroupChat } = require('./models/bot');
const { tashkentParts, dateKey, parseHHMM, effectivePayDay, TZ_OFFSET_MS, DAY_MS } = require('./lib/time');
const attendance = require('./bot/attendance');
const payments = require('./bot/payments');
const CATCH_UP_MS = 20 * 60_000;

function plannedJobs(group, now = new Date()) {
  const jobs = [];
  const p = tashkentParts(now);
  const midnight = Date.UTC(p.year, p.month - 1, p.day) - TZ_OFFSET_MS;
  // Yesterday for midnight catch-up, tomorrow for a 00:15 attendance opening at 23:45.
  for (const offset of [-1, 0, 1]) {
    const start = midnight + offset * DAY_MS;
    const day = new Date(start);
    const parts = tashkentParts(day);
    const date = dateKey(day);
    const add = (type, time, key) => {
      if (now.getTime() >= time && now.getTime() - time < CATCH_UP_MS) jobs.push({ type, date, key });
    };
    const at = parseHHMM(group.attendance_time);
    if (group.days.includes(parts.weekday) && at !== null) {
      const reportTime = start + at * 60_000;
      if (now.getTime() < reportTime) add('attendance-open', reportTime - config.ATTENDANCE_OPEN_BEFORE_MIN * 60_000, `att-open:${group.chat_id}:${date}`);
      add('attendance-post', reportTime, `att-post:${group.chat_id}:${date}`);
    }
    const payAt = parseHHMM(group.pay_time);
    if (parts.day === effectivePayDay(group.pay_day, parts.year, parts.month) && payAt !== null) {
      add('payment-post', start + payAt * 60_000, `pay:${group.chat_id}:${date.slice(0, 7)}`);
      add('payment-admin', start + payAt * 60_000, `pay-admin:${group.chat_id}:${date.slice(0, 7)}`);
    }
  }
  return jobs;
}

async function tick(api, now = new Date()) {
  const groups = await GroupChat.find({ enabled: true }).lean();
  for (const group of groups) {
    for (const job of plannedJobs(group, now)) {
      try {
        if (job.type === 'attendance-open') await attendance.sendSheetToAdmins(api, group, job.date, job.key);
        if (job.type === 'attendance-post') await attendance.postReport(api, group, job.date, job.key);
        if (job.type === 'payment-post') await payments.postReport(api, group, job.key);
        if (job.type === 'payment-admin') await payments.sendUnpaidToAdmins(api, group, job.key);
      } catch (error) { console.error(`Rejalashtiruvchi (${job.key}):`, error.description || error.message); }
    }
  }
}
function startScheduler(api) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(api); }
    catch (error) { console.error('Rejalashtiruvchi:', error.message); }
    finally { running = false; }
  };
  void run();
  return setInterval(run, 30_000);
}
module.exports = { startScheduler, tick, plannedJobs };
