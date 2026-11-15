const assert = require('node:assert/strict');
const { BioGroup: Group, BioMock: Mock, JobLog } = require('../src/storage/postgres');
const { tick } = require('../src/biology/service');

module.exports = async function scheduleFlow(checks) {
  const ok = (value, label) => { assert.ok(value, label); checks.push(label); };
  // Isolated PGlite fixtures only; no real Telegram requests.
  await Group.updateMany({}, { $set: { enabled: false } });
  const group = await Group.create({ chat_id: -100991000099, title: 'Reminder fixture' });
  const now = new Date('2030-01-05T18:55:00Z'); // Saturday 23:55 in Tashkent.
  const at = minutes => new Date(now.getTime() + minutes * 60_000);
  const sent = []; let failReminder = false;
  const api = { sendMessage: async (chat_id, text, options) => {
    if (failReminder && text.includes('Boshlanishiga')) throw new Error('fixture offline');
    sent.push({ chat_id, text, options });
    return { message_id: sent.length };
  } };
  let code = 0;
  const paper = (extra = {}) => Mock.create({
    group_id: group._id, code: (++code).toString(16).padStart(6, '0'), title: 'Reminder mock', count: 50,
    status: 'scheduled', starts_at: at(10), ends_at: at(70),
    answer_key: Array(50).fill('D'), materials: [{ kind: 'text', text: 'Private paper fixture' }], ...extra,
  });
  const reminders = () => sent.filter(m => m.text.includes('Boshlanishiga'));

  const scheduled = await paper();
  await tick(api, new Date(now.getTime() - 1));
  ok(sent.length === 0, 'start reminder never sends before the ten-minute window');
  await tick(api, now);
  ok(reminders().length === 1 && reminders()[0].chat_id === group.chat_id &&
    reminders()[0].text.includes('Boshlanishiga 10 minut qoldi!') &&
    reminders()[0].text.includes('2030-01-06 00:05 (Toshkent)'), 'start reminder uses the selected group and Tashkent start time');
  ok((await Mock.findById(scheduled._id)).status === 'scheduled' && sent.length === 1 &&
    !sent[0].text.includes('Private paper fixture'), 'start reminder keeps the paper and submission window closed');
  await tick(api, at(1)); await tick(api, at(2));
  ok(reminders().length === 1 && (await JobLog.findOne({ key: `bio:prestart:${scheduled._id}` })).state === 'done',
    'persisted delivery prevents reminder duplicates on later scheduler runs');
  await tick(api, at(10));
  ok((await Mock.findById(scheduled._id)).status === 'open' && reminders().length === 1 &&
    sent.some(m => m.text === 'Private paper fixture'), 'start time opens the mock and sends its paper without another prestart reminder');
  await Mock.updateOne({ _id: scheduled._id }, { $set: { status: 'cancelled' } });

  const late = await paper({ starts_at: at(7) });
  await tick(api, now);
  ok(reminders().length === 2 && reminders().at(-1).text.includes('Boshlanishiga 7 minut qoldi!'),
    'a newly scheduled or recovered mock inside the window shows the actual remaining minutes');
  await Mock.updateOne({ _id: late._id }, { $set: { status: 'cancelled' } });
  const retry = await paper();
  failReminder = true; await tick(api, now);
  ok(reminders().length === 2 && (await JobLog.findOne({ key: `bio:prestart:${retry._id}` })).state === 'failed',
    'failed prestart delivery is recorded for retry');
  failReminder = false; await tick(api, at(1)); await tick(api, at(2));
  ok(reminders().length === 3 && reminders().at(-1).text.includes('Boshlanishiga 9 minut qoldi!'),
    'retry sends one reminder with an updated countdown');
  await Mock.updateOne({ _id: retry._id }, { $set: { status: 'cancelled' } });
  const cancelled = await paper({ status: 'cancelled' });
  const missed = await paper({ starts_at: at(-70), ends_at: at(-10) });
  await tick(api, now);
  ok(reminders().length === 3 && !(await JobLog.findOne({ key: `bio:prestart:${cancelled._id}` })) &&
    (await Mock.findById(missed._id)).status === 'missed', 'cancelled and expired mocks cannot produce a prestart reminder');

  const atStart = await paper({ starts_at: now });
  await tick(api, now);
  ok((await Mock.findById(atStart._id)).status === 'open' && reminders().length === 3,
    'a scheduler arriving at start skips stale reminders and still opens the mock');
  await Mock.updateOne({ _id: atStart._id }, { $set: { status: 'cancelled' } });
  const disabled = await paper();
  await Group.updateOne({ _id: group._id }, { $set: { enabled: false } });
  await tick(api, now);
  ok(reminders().length === 3, 'disabled groups receive no start reminder');
  await Mock.updateOne({ _id: disabled._id }, { $set: { status: 'cancelled' } });

  await Group.updateOne({ _id: group._id }, { $set: { enabled: true, weekly_enabled: true, weekday: 0, time: '00:05', duration: 60 } });
  const thirty = await paper({ status: 'queued', count: 30, answer_key: Array(30).fill('D'), createdAt: at(-3) });
  const weekly = await paper({ status: 'queued', createdAt: at(-2) });
  const nextWeek = await paper({ status: 'queued', createdAt: at(-1) });
  await tick(api, new Date(now.getTime() - 1));
  ok((await Mock.findById(weekly._id)).status === 'queued', 'weekly paper is not reserved more than ten minutes early');
  await tick(api, now); await tick(api, at(1));
  const reserved = await Mock.findById(weekly._id);
  ok(reserved.status === 'scheduled' && reserved.weekly_slot === at(10).toISOString() &&
    reminders().length === 4 && reminders().at(-1).text.includes('Boshlanishiga 10 minut qoldi!') &&
    (await Mock.findById(thirty._id)).status === 'queued' && (await Mock.findById(nextWeek._id)).status === 'queued',
    'weekly scheduling reserves one 50-question mock and reminds across the Tashkent day boundary');
  await tick(api, at(10));
  ok((await Mock.findById(weekly._id)).status === 'open' && reminders().length === 4 &&
    (await Mock.findById(nextWeek._id)).status === 'queued', 'weekly mock opens at its original time without consuming another queued paper');
};
