const { Bot } = require('grammy');
const config = require('../config');
const { getSession, clearSession, persistentSession, steps, sendMenu, isAdmin } = require('./common');

function createBot(options = {}) {
  const bot = new Bot(config.BOT_TOKEN);

  // Student work, credentials and admin editing are private-chat only.
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private') return next();
    if (ctx.myChatMember || ctx.chatMember || ctx.message?.migrate_to_chat_id || ctx.message?.migrate_from_chat_id) return next();
    const command = /^\/(ulash|uzish|sozlamalar|davomat_vaqti|dars_kunlari|tolov_sanasi|davomat|tolov)(?:@\w+)?(?:\s|$)/;
    if (ctx.message?.text && command.test(ctx.message.text)) return next();
    if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: 'Botning shaxsiy chatini oching.' });
    return null;
  });
  bot.use(persistentSession);

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
  require('./materials').register(bot);
  require('./admin').register(bot);
  require('./attendance').register(bot);
  require('./payments').register(bot);
  require('./group').register(bot);
  require('./screenshots').register(bot, options.screenshots);

  // Bosqichma-bosqich kiritish (login, javoblar, tahlil, test qo'shish...) — faqat shaxsiy chatda
  bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return null;
    const s = getSession(ctx.from.id);
    if (s && steps[s.step]) {
      if (/^(t_|w_)/.test(s.step) && !(await isAdmin(ctx.from.id))) {
        clearSession(ctx.from.id);
        return ctx.reply('Bu amal faqat admin uchun.');
      }
      return steps[s.step](ctx, s);
    }
    return sendMenu(ctx, "Menyudan tanlang 👇 (yoki /start)");
  });

  bot.catch(async (err) => {
    console.error(`Bot xatosi (update ${err.ctx?.update?.update_id}):`, err.error);
    await awaitErrorReply(err.ctx);
  });

  return bot;
}

function awaitErrorReply(ctx) {
  if (ctx?.chat?.type === 'private') {
    return ctx.reply('Amal bajarilmadi. Qayta urinib ko‘ring yoki /cancel bosing.').catch(() => {});
  }
  return null;
}

module.exports = { createBot };
