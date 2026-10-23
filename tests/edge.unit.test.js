const { test } = require('node:test');
const assert = require('node:assert/strict');
const { revive, project, configureDatabase, Test, User, ScreenshotResult } = require('../src/storage/postgres');
const modulePath = '../supabase/functions/enzo-bot/handler.mjs';
const settings = { BOT_TOKEN: 'fixture-token', WEBHOOK_SECRET: 'hook-secret', CRON_SECRET: 'cron-secret', ADMIN_IDS: '12,34' };
function fixture(extra = {}) {
  const calls = [], work = [];
  const runtime = { config: {}, configureDatabase() {}, createBot() { return { async init() {}, botInfo: { username: 'fixture' }, api: {}, async handleUpdate() {} }; }, async tick() {} };
  const rpc = async (name, body) => { calls.push([name, body]); if (name === 'enzo_runtime_settings') return settings; if (name === 'enzo_lease') return true; if (name === 'enzo_queue' && body.p_action === 'claim') return null; return true; };
  return { runtime, rpc, calls, work, waitUntil: p => work.push(p), logger: { error() {} }, ...extra };
}
const request = (suffix, secret, body = { update_id: 1 }) => new Request(`https://example.test/enzo-bot/${suffix}`, { method: 'POST', headers: { [suffix === 'cron' ? 'x-enzo-cron-secret' : 'x-telegram-bot-api-secret-token']: secret, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('webhook rejects forged requests without enqueueing', async () => {
  const { createHandler } = await import(modulePath); const f = fixture();
  assert.equal((await createHandler(f)(request('webhook', 'wrong'))).status, 401);
  assert.ok(!f.calls.some(([n]) => n === 'enzo_queue')); assert.equal(f.work.length, 0);
});
test('webhook acknowledges only a durable enqueue, then runs background worker', async () => {
  const { createHandler } = await import(modulePath); const f = fixture();
  assert.equal((await createHandler(f)(request('webhook', 'hook-secret'))).status, 200);
  assert.ok(f.calls.some(([n,b]) => n === 'enzo_queue' && b.p_action === 'enqueue'));
  await Promise.all(f.work); assert.deepEqual(f.runtime.config.ADMIN_IDS, [12,34]);
});
test('database enqueue failure returns retryable error', async () => {
  const { createHandler } = await import(modulePath); const f = fixture(); const original = f.rpc;
  f.rpc = (name, body) => name === 'enzo_queue' ? Promise.reject(new Error('private data')) : original(name,body);
  const response = await createHandler(f)(request('webhook', 'hook-secret'));
  assert.equal(response.status,503); assert.ok(!(await response.text()).includes('private data'));
});
test('cron requires separate secret and starts both scheduler and recovery', async () => {
  const { createHandler } = await import(modulePath); const f = fixture(); const handle = createHandler(f);
  assert.equal((await handle(request('cron','hook-secret'))).status,401);
  assert.equal((await handle(request('cron','cron-secret'))).status,202);
  await Promise.all(f.work);
  assert.ok(f.calls.some(([n,b]) => n === 'enzo_lease' && b.p_key === 'schedule'));
});
test('malformed updates never reach queue', async () => {
  const { createHandler } = await import(modulePath); const f = fixture();
  assert.equal((await createHandler(f)(request('webhook','hook-secret',{update_id:'1'}))).status,400);
  assert.equal(f.work.length,0);
});
test('worker failure preserves update for retry and releases lease', async () => {
  const { createHandler } = await import(modulePath); const f = fixture(); const base = f.rpc;
  f.rpc = (n,b) => n==='enzo_queue' && b.p_action==='claim' ? Promise.resolve({update_id:9}) : base(n,b);
  f.runtime.createBot = () => ({ async init() {}, botInfo:{username:'fixture'}, async handleUpdate() {throw new Error('private error');} });
  await createHandler(f)(request('webhook','hook-secret')); await Promise.all(f.work);
  assert.ok(f.calls.some(([n,b])=>n==='enzo_queue'&&b.p_action==='fail'&&b.p_error==='handler'));
  assert.ok(f.calls.some(([n,b])=>n==='enzo_lease'&&b.p_release));
});
test('new secret key uses apikey only; duplicate SQL constraint maps to bot code', async () => {
  const { createRpc } = await import(modulePath); let headers;
  const rpc = createRpc('https://example.test','sb_secret_fixture',async (_,init) => { headers=init.headers; return new Response('{"code":"23505","details":"private"}',{status:409}); });
  await assert.rejects(rpc('enzo_documents'), e => e.code===11000 && !e.message.includes('private'));
  assert.equal(headers.apikey,'sb_secret_fixture'); assert.equal(headers.Authorization,undefined);
});
test('adapter revives persisted dates and preserves inclusion projections', () => {
  const d=revive({_id:'a',accepted_at:'2026-10-23T00:00:00.000Z',title:'hello'});
  assert.ok(d.accepted_at instanceof Date); assert.deepEqual(project(d,'title'),{_id:'a',title:'hello'});
});
test('adapter sends filters and atomic updates to database, including defaults', async () => {
  const calls=[]; configureDatabase(async (name,args) => {calls.push(args); return {_id:'a',title:'Test'};});
  await Test.findOneAndUpdate({_id:'a'},{$set:{title:'Test'}},{upsert:true,new:true}).lean();
  assert.equal(calls[0].p_options.defaults.active,true); assert.equal(calls[0].p_update.$set.title,'Test');
  assert.equal(calls[0].p_collection,'bot_tests');
});
test('adapter AI budget sums all recent reads, rather than counting images', async () => {
  configureDatabase(async () => [{_id:'a',read_count:3},{_id:'b',read_count:4}]);
  const out=await ScreenshotResult.aggregate([{$match:{user:'u'}},{$group:{_id:null,count:{$sum:'$read_count'}}}]);
  assert.equal(out[0].count,7);
});
