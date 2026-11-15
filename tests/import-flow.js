const assert=require('node:assert/strict');
const {createHmac}=require('crypto');
const {C}=require('../src/biology/import-ui');
const {handleApi}=require('../src/biology/api');
const config=require('../src/config');
const service=require('../src/biology/service');
const {permitRetake}=require('../src/biology/catalog');
const {BioPackage:Package,BioMock:Mock,BioSubmission:Submission,BioAttempt:Attempt,BotSession}=require('../src/storage/postgres');
function init(user){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(user)});const secret=createHmac('sha256','WebAppData').update(config.BOT_TOKEN).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort().map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return p.toString();}
module.exports=async({msg,cb,owner,student,outsider,g,bot,checks,db,calls})=>{
 const ok=(v,label)=>{assert.ok(v,label);checks.push(label);};
 await msg(owner,C.upload);ok(!await Package.exists({}),'student mode cannot import');
 await msg(owner,'🛠 Admin rejimi');await msg(student,C.upload);ok(!await Package.exists({}),'non-admin cannot upload MOCK');
 await msg(owner,C.upload);await msg(owner,null,{document:{file_id:'fixture-import',file_name:'mock.zip'}});
 let p=await Package.findOne({mock_id:'BIO7-FORMAT-DEMO'});ok(p?.status==='draft'&&p.questions.length===30,'ZIP import wizard saves validated questions as a draft');
 await cb(owner,`cp:send:${p._id}`);ok(!await Mock.exists({package_id:p._id}),'draft cannot be sent to a group');
 await cb(student,`ca:${p._id}`);ok((await Package.findById(p._id)).status==='draft','student cannot approve a draft');
 await cb(owner,`ca:${p._id}`);await cb(owner,`cp:send:${p._id}`);await cb(owner,`bgpick:${g._id}`);await cb(owner,'bp:now');
 const sess=await BotSession.findOne({telegram_id:owner});await cb(owner,`bpub:${sess.data.data._id}`);
 let m=await Mock.findOne({package_id:p._id});ok(m?.status==='scheduled'&&m.version===1&&m.question_ids.length===30&&!m.materials.length,'approved import becomes a scheduled immutable snapshot without source HTML');
 config.MINIAPP_URL='https://biology.example';
 const request=async(action,body={},token='',origin='https://biology.example')=>{
   const res=await handleApi(new Request(`https://backend.example/api/${action}`,{method:'POST',headers:{origin,'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}),{api:bot.api});return {status:res.status,headers:res.headers,data:await res.json()};
 };
 ok((await request('session',{init_data:'user={"id":123}'})).status===401,'unsigned Telegram ID cannot log in');
 let r=await request('session',{init_data:init({id:student,first_name:'Student'})}),token=r.data.token;
 ok(r.status===200&&r.headers.get('access-control-allow-origin')===config.MINIAPP_URL,'signed Telegram login issues an origin-restricted server session');
 ok((await request('start',{run_id:m._id},token)).status===400,'API rejects test access before start');
 await Mock.updateOne({_id:m._id},{$set:{status:'open',starts_at:new Date(Date.now()-1000),ends_at:new Date(Date.now()+60000)}});m=await Mock.findById(m._id);
 r=await request('start',{run_id:m._id},token);ok(r.status===200&&r.data.mock.questions.length===30&&!JSON.stringify(r.data).includes('answer_key')&&!JSON.stringify(r.data).includes('"answer":'),'Mini App receives questions with no answer key or inline answers');
 const nonce=r.data.attempt.nonce,choices=Object.fromEntries(m.questions.map((q,i)=>[q.question_id,m.answer_key[i]]));
 const body={run_id:m._id,mock_id:m.external_mock_id,version:m.version,nonce,answers:choices,telegram_id:outsider,started_at:'2000-01-01',finished_at:'2000-01-02'};
 ok((await request('submit',{...body,version:2},token)).status===400,'API rejects a stale mock version');
 ok((await request('submit',body,token,'https://evil.example')).status===403,'foreign origins cannot invoke the Mini App');
 r=await request('submit',body,token);ok(r.data.correct===30&&r.data.percent===100,'Mini App grades all answers against the server key');
 const sub=await Submission.findOne({mock_id:m._id});ok(sub.telegram_id===student&&sub.version===1&&sub.external_mock_id===m.external_mock_id&&new Date(sub.started_at)>new Date('2026-01-01'),'submission binds signed Telegram identity, mock version and server timestamps');
 ok((await request('submit',body,token)).data.correct===30,'same submission retries are idempotent');
 ok((await request('submit',{...body,answers:{...choices,Q001:'D'}},token)).status===400,'changing submitted answers is blocked');
 await permitRetake(m.code,student);r=await request('start',{run_id:m._id},token);const next=r.data.attempt.nonce;
 ok(next!==nonce&&(await request('submit',body,token)).status===400,'admin retake starts a fresh attempt and rejects old-tab submissions');
 ok((await request('submit',{...body,nonce:next,answers:{...choices,Q001:'D'}},token)).data.correct===29,'granted retake updates leaderboard score');
 ok((await Submission.findOne({mock_id:m._id})).history.length===1,'retake preserves earlier attempt for admin audit');
 // Owner solves the same imported test using Telegram buttons.
 await msg(owner,'🎓 O‘quvchi rejimi');await cb(owner,`bs:${m._id}`);let a=await Attempt.findOne({mock_id:m._id,telegram_id:owner});
 await cb(owner,`bq:${m._id}:${a.nonce.slice(0,8)}:0:A`);await cb(owner,`bf:${m._id}:${a.nonce.slice(0,8)}`);
 const {BioProfile:Profile}=require('../src/storage/postgres');const pr=await Profile.findOne({telegram_id:owner});await cb(owner,`bc:${owner}:${pr.pending.token}`);
 ok((await Submission.findOne({mock_id:m._id,telegram_id:owner})).correct===1,'Telegram question buttons and final confirmation use the same grading path');
 const report=await service.resultsText(m);ok(!report.includes('Javob kaliti')&&report.includes('29/30'),'group leaderboard never exposes the answer key');
 await Mock.updateOne({_id:m._id},{$set:{ends_at:new Date(Date.now()-1000)}});
 ok((await request('submit',{...body,nonce:next},token)).status===400,'late API submission is refused even with a valid session');
 await msg(owner,'🛠 Admin rejimi');await cb(owner,`cd:${p._id}`);ok((await Package.findById(p._id)).status==='deleted'&&await Submission.countDocuments({mock_id:m._id})===2,'deleting catalogue entry preserves historic runs and results');
 for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);await assert.rejects(db.query('select public.bio_begin($1,$2,$3,$4)',[m._id,student,'a'.repeat(24),'b'.repeat(32)]),/permission denied/);await assert.rejects(db.query('select data from public.enzo_documents_store'),/permission denied/);await db.exec('reset role');
 }
 checks.push('public database roles cannot read keys or start an attempt');
};
