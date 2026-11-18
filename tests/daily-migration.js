const assert=require('node:assert/strict');
module.exports=async(db,sql)=>{
  const p='ee0000000000000000000001',run='ee0000000000000000000002',sub='ee0000000000000000000003',g='ee0000000000000000000004',cancelled='ee0000000000000000000005';
  const end='2026-11-15T16:30:00.000Z';
  const rows=[['bio_packages',p,{status:'approved',mock_id:'UPGRADE-FIXTURE',version:1}],['bio_groups',g,{weekly_enabled:true}],
    ['bio_mocks',run,{package_id:p,group_id:g,code:'ee0001',status:'closed',questions:[],ends_at:end}],
    ['bio_mocks',cancelled,{package_id:p,group_id:g,code:'ee0002',status:'cancelled',questions:[],ends_at:end}],
    ['bio_submissions',sub,{mock_id:run,telegram_id:991900002,correct:29,total:30,answers:['A']}]];
  for(const [collection,id,data]of rows)await db.query('insert into public.enzo_documents_store values($1,$2,$3)',[collection,id,JSON.stringify(data)]);
  await db.exec(sql);
  const after=(await db.query('select id,data from public.enzo_documents_store')).rows;
  const data=id=>after.find(r=>r.id===id).data;
  assert.equal(data(run).status,'daily');assert.equal(data(run).legacy_status,'closed');
  assert.equal(data(cancelled).status,'cancelled');assert.equal(data(g).daily_mode,true);assert.equal(data(g).weekly_enabled,false);
  assert.equal(data(sub).correct,29);assert.equal(data(sub).total,30);assert.deepEqual(data(sub).answers,['A']);
  assert.equal(data(sub).available_at,end);assert.equal(data(sub).package_id,p);
  await db.query('delete from public.enzo_documents_store where id=any($1::text[])',[rows.map(r=>r[1])]);
  console.log('Daily migration: historic score/release preserved, cancelled paper stays hidden PASS');
};
