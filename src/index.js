const mongoose = require('mongoose');
const config = require('./config');
const { createBot } = require('./bot');
const { createServer } = require('./api/server');
const { startScheduler } = require('./scheduler');

async function main() {
  if (!config.BOT_TOKEN) throw new Error("BOT_TOKEN .env faylida yo'q");
  if (!config.MONGO_URI) throw new Error("MONGO_URI .env faylida yo'q");
  if (!config.STANDALONE && !config.JWT_SECRET) throw new Error("Ilova rejimida JWT_SECRET talab qilinadi");
  if (!config.ADMIN_IDS.length) console.warn('ADMIN_IDS bo‘sh. /id orqali Telegram IDni oling va ADMIN_IDSga kiriting.');
  await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  // Await unique indexes before accepting updates or running scheduled jobs.
  for (const model of Object.values(mongoose.models)) await model.init();
  const bot = createBot();
  await bot.init();
  config.BOT_USERNAME = bot.botInfo.username;
  await bot.api.setMyCommands([
    { command: 'start', description: 'Boshlash / kirish' },
    { command: 'menu', description: 'Asosiy menyu' },
    { command: 'materiallar', description: 'Test fayllari va materiallar' },
    { command: 'id', description: 'Telegram ID' },
    { command: 'tahlil', description: 'Tugallanmagan tahlil' },
    { command: 'skrin', description: 'HTML test natijasi skrinshotini yuborish' },
    { command: 'cancel', description: 'Bekor qilish' },
  ]);
  const server = createServer().listen(config.PORT, () => console.log(`API ${config.PORT}-portda`));
  server.on('error', (error) => { console.error('HTTP server:', error.message); process.exit(1); });
  const timer = startScheduler(bot.api);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    const timeout = setTimeout(() => process.exit(1), 10_000).unref();
    if (bot.isRunning()) await bot.stop();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    clearTimeout(timeout);
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await bot.start({
    allowed_updates: ['message', 'callback_query', 'my_chat_member', 'chat_member'],
    onStart: (me) => console.log(`Bot ishga tushdi: @${me.username}`),
  });
}
main().catch((error) => { console.error('Ishga tushmadi:', error.message); process.exit(1); });
