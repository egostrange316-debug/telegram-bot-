const { Bot } = require('grammy');
const config = require('../config');
const { getSession, clearSession, steps, sendMenu } = require('./common');

function createBot() {
  const bot = new Bot(config.BOT_TOKEN);

  bot.callbackQuery('cancel', async (ctx) => {
    clearSession(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Bekor qilindi' });
    await ctx.editMessageReplyMarkup().catch(() => {});
    return ctx.chat?.type === 'private' ? sendMenu(ctx) : null;
  });
  bot.command('cancel', async (ctx) => {
    clearSession(ctx.from.id);
    return ctx.chat.type === 'private' ? sendMenu(ctx, 'Bekor qilindi.') : null;
  });

  require('./student').register(bot);
  require('./admin').register(bot);
  require('./attendance').register(bot);
  require('./payments').register(bot);
  require('./group').register(bot);

  // Bosqichma-bosqich kiritish (login, javoblar, tahlil, test qo'shish...) — faqat shaxsiy chatda
  bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return null;
    const s = getSession(ctx.from.id);
    if (s && steps[s.step]) return steps[s.step](ctx, s);
    return sendMenu(ctx, "Menyudan tanlang 👇 (yoki /start)");
  });

  bot.catch((err) => {
    console.error(`Bot xatosi (update ${err.ctx?.update?.update_id}):`, err.error);
  });

  return bot;
}

module.exports = { createBot };
