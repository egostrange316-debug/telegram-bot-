const mongoose = require('mongoose');
const config = require('./config');
const { createBot } = require('./bot');
const { createServer } = require('./api/server');
const { startScheduler } = require('./scheduler');

async function main() {
  if (!config.BOT_TOKEN) throw new Error('BOT_TOKEN .env faylida yo\'q');
  if (!config.MONGO_URI) throw new Error("MONGO_URI .env faylida yo'q (ilova bilan bir xil baza bo'lishi kerak)");
  if (!config.ADMIN_IDS.length) console.warn("Ogohlantirish: ADMIN_IDS bo'sh — admin faqat ilovadagi admin login qilganda bo'ladi");

  await mongoose.connect(config.MONGO_URI);
  console.log('MongoDB ulandi');

  const bot = createBot();
  await bot.api.setMyCommands([
    { command: 'start', description: 'Boshlash / kirish' },
    { command: 'menu', description: 'Asosiy menyu' },
    { command: 'cancel', description: 'Bekor qilish' },
  ]);

  createServer().listen(config.PORT, () => console.log(`API ${config.PORT}-portda`));
  const timer = startScheduler(bot.api);

  const stop = async () => {
    clearInterval(timer);
    await bot.stop();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await bot.start({
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    onStart: (me) => console.log(`Bot ishga tushdi: @${me.username}`),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
