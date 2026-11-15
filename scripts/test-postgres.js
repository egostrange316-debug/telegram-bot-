const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);`);
  await db.exec(fs.readFileSync('supabase/sql/schema.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261115072715_biology_mock.sql','utf8'));
  const rpc = async (name, args = {}) => {
    if (name === 'bio_submit') {
      const result = await db.query('select public.bio_submit($1,$2,$3::jsonb,$4) as result',
        [args.p_mock_id,args.p_telegram_id,JSON.stringify(args.p_answers),args.p_new_id]);
      return result.rows[0].result;
    }
    if (name !== 'enzo_documents') throw new Error('Unexpected test RPC');
    const keys=['p_collection','p_operation','p_filter','p_update','p_sort','p_limit','p_options'];
    const values=keys.map((k,i)=>i===0||i===1||i===5 ? args[k] : JSON.stringify(args[k]));
    try {
      const result=await db.query('select public.enzo_documents($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb) as result', values);
      return result.rows[0].result;
    } catch(e) { if(e.code==='23505')e.code=11000; throw e; }
  };
  try {
    const run = require(process.argv.includes('--biology') ? '../tests/.generated-biology.cjs' : '../tests/.generated-flow.cjs');
    const result=await run(rpc,db); console.log(JSON.stringify(result,null,2));
    const count=await db.query('select count(*)::integer as count from public.enzo_documents_store');
    if (count.rows[0].count !== 0) throw new Error('Fixture cleanup left documents');
  } finally { await db.close(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
