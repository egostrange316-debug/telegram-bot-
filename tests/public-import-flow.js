const assert=require('node:assert/strict');
const {zipSync,strToU8}=require('fflate');
const config=require('../src/config');
const {C}=require('../src/biology/import-ui');
const {importFile}=require('../src/biology/importer');
const {snapshot}=require('../src/biology/catalog');
const {issueSession}=require('../src/biology/auth');
const {handleApi}=require('../src/biology/api');
const {BioPackage:Package,BioMock:Mock,BioSubmission:Submission,BioAttempt:Attempt,BotSession}=require('../src/storage/postgres');

// Optional private input stays outside the repository and the production bundle.
function archive(){
 if(process.env.BIO_IMPORT_ZIP)return require('node:fs').readFileSync(process.env.BIO_IMPORT_ZIP);
 const files={'BOT_INTEGRATSIYA.txt':strToU8('Integration example only')};
 for(const n of [3,4]){
  const mock_id=`BIO7-50-59-M${n}`,questions=Array.from({length:30},(_,i)=>({id:`${mock_id}-${String(i+1).padStart(2,'0')}`,topic:50,difficulty:i%3+1,question:`Synthetic question ${i+1}`,options:{A:'A option',B:'B option',C:'C option',D:'D option'}}));
  files[`MOCK_0${n}_public.json`]=strToU8(JSON.stringify({mock_id,questions}));
  files[`MOCK_0${n}_SERVER_ONLY_answers.json`]=strToU8(JSON.stringify({mock_id,answers:Object.fromEntries(questions.map((q,i)=>[q.id,'ABCD'[i%4]]))}));
  files[`BIO7_MOCK_0${n}_BOT.html`]=strToU8('<script>throw Error("do not execute imported HTML")</script>');
 }
 return zipSync(files);
}
async function run({msg,cb,owner,student,g,bot,checks}){
 const ok=(v,label)=>{assert.ok(v,label);checks.push(label);};
 const expected=importFile(archive(),'BIO_MOCK_3_4_QAYTA_YUKLASH.zip').packages;
 await msg(owner,'🛠 Admin rejimi');await msg(owner,C.upload);
 await msg(owner,null,{document:{file_id:'fixture-public-bundle',file_name:'BIO_MOCK_3_4_QAYTA_YUKLASH.zip'}});
 let pick=(await BotSession.findOne({telegram_id:owner})).data;
 ok(pick.step==='import_pick'&&pick.data.packages.length===2,'public/server-only ZIP reaches the admin two-MOCK selection');
 for(let i=0;i<expected.length;i++){
  pick=(await BotSession.findOne({telegram_id:owner})).data;
  await cb(owner,`ci:${pick.data.token}:0`);
 }
 const packages=await Package.find({mock_id:{$in:expected.map(p=>p.mock_id)}});
 ok(packages.length===2&&packages.every(p=>p.status==='draft'),'both public export MOCKs remain drafts until admin approval');
 for(const p of packages){
  const source=expected.find(x=>x.mock_id===p.mock_id);
  assert.deepEqual(p.questions,source.questions);assert.deepEqual(p.answer_key,source.answer_key);
 }
 checks.push('public export saves every normalized question and server key without changing their order');
 config.MINIAPP_URL='https://biology.example';
 const token=issueSession({id:student,first_name:'Student'},config.BOT_TOKEN);
 const request=async(action,body={})=>{const res=await handleApi(new Request(`https://backend.example/api/${action}`,{method:'POST',headers:{origin:config.MINIAPP_URL,'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)}),{api:bot.api});return {status:res.status,data:await res.json()};};
 for(const p of packages){
  await cb(owner,`ca:${p._id}`);
  const m=await Mock.create({...snapshot(await Package.findById(p._id)),group_id:g._id,status:'open',code:p.mock_id.endsWith('M3')?'e00303':'e00404',starts_at:new Date(Date.now()-1000),ends_at:new Date(Date.now()+600000)});
  let r=await request('start',{run_id:m._id});
  ok(r.status===200&&r.data.mock.questions.length===30&&!JSON.stringify(r.data).includes('answer_key')&&!JSON.stringify(r.data).includes('correct_answer'),`${p.mock_id}: authenticated HTML receives all questions without the key`);
  const answers=Object.fromEntries(m.questions.map((q,i)=>[q.question_id,i===0?(m.answer_key[i]==='A'?'B':'A'):i===1?'-':m.answer_key[i]]));
  const body={run_id:m._id,mock_id:m.external_mock_id,version:m.version,nonce:r.data.attempt.nonce,answers};
  r=await request('submit',body);
  ok(r.status===200&&r.data.received&&!('correct' in r.data)&&!('percent' in r.data)&&(await Submission.findOne({mock_id:m._id,telegram_id:student})).correct===28,`${p.mock_id}: submission saves the graded result but returns only a receipt`);
  r=await request('review',{run_id:m._id,now:'2099-01-01',server_time:'2099-01-01',ends_at:'2000-01-01',status:'closed'});
  ok(r.status===400&&!JSON.stringify(r.data).includes('correct_answer'),`${p.mock_id}: forged phone time and closed status cannot release analysis early`);
  r=await request('list');const history=r.data.history.find(x=>x.run_id===m._id);
  ok(history&&!history.review_ready&&!('correct' in history),`${p.mock_id}: reopening during the shared window keeps scores hidden`);
  await Mock.updateOne({_id:m._id},{$set:{ends_at:new Date(Date.now()-1000)}});
  const before=JSON.stringify({submission:await Submission.findOne({mock_id:m._id}),attempt:await Attempt.findOne({mock_id:m._id})});
  r=await request('review',{run_id:m._id,now:'2000-01-01'});
  ok(r.status===200&&r.data.result.correct===28&&r.data.questions[0].correct_answer===m.answer_key[0]&&r.data.questions[1].selected_answer==='-'&&r.data.questions[2].is_correct,`${p.mock_id}: server deadline opens wrong/blank/correct analysis despite an old phone time`);
  const late=await request('submit',{...body,answers:Object.fromEntries(m.questions.map((q,i)=>[q.question_id,m.answer_key[i]])),finished_at:'2000-01-01'});
  const after=JSON.stringify({submission:await Submission.findOne({mock_id:m._id}),attempt:await Attempt.findOne({mock_id:m._id})});
  ok(late.status===400&&before===after,`${p.mock_id}: analysis is read-only and late changes cannot alter the stored result`);
 }
}
module.exports={archive,run};
