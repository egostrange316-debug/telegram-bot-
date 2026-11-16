const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);`);
  await db.exec(fs.readFileSync('supabase/sql/schema.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261115072715_biology_mock.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261115085124_biology_import.sql','utf8'));
  await require('../tests/deletion-migration')(db, fs.readFileSync('supabase/migrations/20261116144055_biology_delete_results.sql','utf8'));
  await db.exec('set role service_role');
  const rpc = async (name, args = {}) => {
    if(name==='bio_delete_package'){const r=await db.query('select public.bio_delete_package($1) as result',[args.p_package_id]);return r.rows[0].result;}
    if (name === 'bio_begin' || name === 'bio_submit_v2') {
      const start = name === 'bio_begin';
      const params = start ? [args.p_mock_id,args.p_telegram_id,args.p_new_id,args.p_nonce] : [args.p_mock_id,args.p_telegram_id,JSON.stringify(args.p_answers),args.p_new_id,args.p_nonce];
      const result = await db.query(start ? 'select public.bio_begin($1,$2,$3,$4) as result' : 'select public.bio_submit_v2($1,$2,$3::jsonb,$4,$5) as result', params);
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
