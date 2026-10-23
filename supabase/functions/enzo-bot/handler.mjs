const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function equalSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function createRpc(url, key, fetcher = fetch) {
  if (!url || !key) throw new Error('Supabase server credentials missing');
  return async function rpc(name, body = {}) {
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    let response;
    try { response = await fetcher(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); }
    catch { throw new Error('Database connection failed'); }
    const result = await response.json();
    if (!response.ok) {
      // Never propagate response details, SQL values, request URLs or secrets.
      const error = new Error(`Database operation failed (${result.code || response.status})`);
      error.code = result.code === '23505' ? 11000 : result.code;
      throw error;
    }
    return result;
  };
}
export function createHandler({ runtime, rpc, waitUntil, clock = Date.now, logger = console }) {
  let settings, settingsAt = 0, initializing;
  async function initialize() {
    if (initializing) return initializing;
    if (settings && clock() - settingsAt < 60_000) return;
    initializing = (async () => {
      settings = await rpc('enzo_runtime_settings');
      const ids = (settings.ADMIN_IDS || '').split(',').map(Number).filter(x => Number.isSafeInteger(x) && x > 0);
      if (!settings.BOT_TOKEN || !settings.WEBHOOK_SECRET || !settings.CRON_SECRET || !ids.length) throw new Error('Bot settings missing');
      Object.assign(runtime.config, { BOT_TOKEN: settings.BOT_TOKEN, GEMINI_API_KEY: settings.GEMINI_API_KEY || '',
        ADMIN_IDS: ids, GEMINI_SCREENSHOT_MODEL: settings.GEMINI_SCREENSHOT_MODEL || 'gemini-3.1-flash-lite' });
      runtime.configureDatabase(rpc);
      settingsAt = clock();
    })();
    try { await initializing; } finally { initializing = null; }
  }
  async function pump() {
    const owner = crypto.randomUUID();
    if (!await rpc('enzo_lease', { p_key: 'updates', p_owner: owner })) return;
    try {
      const bot = runtime.createBot();
      await bot.init();
      runtime.config.BOT_USERNAME = bot.botInfo.username;
      const deadline = clock() + 65_000;
      while (clock() < deadline) {
        if (!await rpc('enzo_lease', { p_key: 'updates', p_owner: owner })) break;
        const update = await rpc('enzo_queue', { p_action: 'claim' });
        if (!update) break;
        try {
          await bot.handleUpdate(update);
          await rpc('enzo_queue', { p_action: 'done', p_id: update.update_id });
        } catch (error) {
          // The error object can contain Telegram file URLs / tokens, so log only a code.
          logger.error('ENZO update failed', update.update_id, error?.code || 'handler');
          await rpc('enzo_queue', { p_action: 'fail', p_id: update.update_id, p_error: String(error?.code || 'handler') });
          break; // Retry this update before processing newer session messages.
        }
      }
    } finally { await rpc('enzo_lease', { p_key: 'updates', p_owner: owner, p_release: true }); }
  }
  async function scheduled() {
    const owner = crypto.randomUUID();
    if (!await rpc('enzo_lease', { p_key: 'schedule', p_owner: owner })) return;
    try {
      const bot = runtime.createBot();
      await bot.init();
      runtime.config.BOT_USERNAME = bot.botInfo.username;
      await runtime.tick(bot.api);
    } finally { await rpc('enzo_lease', { p_key: 'schedule', p_owner: owner, p_release: true }); }
  }
  const background = fn => waitUntil(fn().catch(error => logger.error('ENZO background failed', error?.code || 'runtime')));
  return async req => {
    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path.endsWith('/health')) return json({ ok: true, service: 'enzo-material-bot' });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      await initialize();
      if (path.endsWith('/cron')) {
        if (!equalSecret(req.headers.get('x-enzo-cron-secret'), settings.CRON_SECRET)) return json({ error: 'Unauthorized' }, 401);
        background(scheduled);
        background(pump);
        return json({ ok: true }, 202);
      }
      if (!path.endsWith('/webhook')) return json({ error: 'Not found' }, 404);
      if (!equalSecret(req.headers.get('x-telegram-bot-api-secret-token'), settings.WEBHOOK_SECRET)) return json({ error: 'Unauthorized' }, 401);
      if (Number(req.headers.get('content-length')) > 1_048_576) return json({ error: 'Too large' }, 413);
      const raw = await req.text();
      if (raw.length > 1_048_576) return json({ error: 'Too large' }, 413);
      let update;
      try { update = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) return json({ error: 'Invalid update' }, 400);
      // Acknowledge only after the payload is durable. Cron recovers abandoned work.
      await rpc('enzo_queue', { p_action: 'enqueue', p_update: update });
      background(pump);
      return json({ ok: true });
    } catch (error) {
      logger.error('ENZO request failed', error?.code || 'runtime');
      return json({ error: 'Temporarily unavailable' }, 503);
    }
  };
}
