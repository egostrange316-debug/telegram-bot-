const assert=require('node:assert/strict');
const {mock:mockTimers}=require('node:test');
const {randomBytes}=require('crypto');
const config=require('../src/config');
const {BioPackage:Package,BioMock:Mock,BioProfile:Profile,BioGroup:Group,BioSubmission:Submission,BioAttempt:Attempt,BioRoom:Room,roomAction}=require('../src/storage/postgres');
const {snapshot,reviewReady,reviewForUser,deletePackage}=require('../src/biology/catalog');
const {validatePackage}=require('../src/biology/importer');
const {handleApi}=require('../src/biology/api');
const {issueSession}=require('../src/biology/auth');
const service=require('../src/biology/service');
module.exports=async({msg,cb,owner,bot,checks,db})=>{
 const ok=(v,label)=>{assert.ok(v,label);checks.push(label);};
 const u=991008001,v=991008002,w=991008003,out=991008004;
 const g=await Group.create({chat_id:-100991008001,title:'Daily fixture',daily_mode:true});
 for(const id of [u,v,w])await Profile.create({telegram_id:id,name:'Daily '+id,group_ids:[g._id]});
 await Profile.create({telegram_id:out,name:'Outsider',group_ids:[]});
 const originalClock='create or replace function enzo_private.bio_now() returns timestamptz language sql volatile security invoker set search_path=\'\' as $$ select clock_timestamp() $$';
 async function at(time,day='2031-02-04'){const iso=day+'T'+time+'+05:00';mockTimers.timers.reset();mockTimers.timers.enable({apis:['Date'],now:new Date(iso).getTime()});await db.exec(`create or replace function enzo_private.bio_now() returns timestamptz language sql volatile security invoker set search_path='' as $$ select '${iso}'::timestamptz $$`);}
 const base=validatePackage(require('../examples/mock-30/import.json').mock,require('../examples/mock-30/import.json').answer_key);
 async function paper(suffix){const p=await Package.create({...base,mock_id:'DAILY-'+suffix,status:'approved',title:'Hujayra '+suffix,topics:['Hujayra']});const m=await Mock.create({...snapshot(p),code:randomBytes(3).toString('hex'),status:'daily',group_id:g._id});return {p,m};}
 config.MINIAPP_URL='https://daily.example';
 const fakeApi={getChatMember:async(_chat,id)=>({status:id===out?'left':'member'}),sendMessage:async()=>({message_id:1})};
 async function api(id,action,body={}){const r=await handleApi(new Request('https://daily.example/api/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+issueSession({id,first_name:'Daily'},config.BOT_TOKEN)},body:JSON.stringify(body)}),{api:fakeApi});return {status:r.status,data:await r.json()};}
 let counter=0;
 async function raw(id,action,payload){return roomAction({p_user:id,p_action:action,p_payload:{new_id:randomBytes(12).toString('hex'),run_code:randomBytes(3).toString('hex'),code:(++counter).toString(16).padStart(8,'0').toUpperCase(),...payload}});}
 try{
  await at('06:59:59');const one=await paper('A');
  ok((await api(u,'start',{run_id:one.m._id})).status===400,'daily tests stay closed before 07:00 in both API and SQL');
  ok((await service.begin(one.m,{id:u})).reason==='closed','database independently enforces opening time');
  await at('07:00:00');let start=await api(u,'start',{run_id:one.m._id});
  ok(start.status===200&&new Date(start.data.mock.ends_at).toISOString()==='2031-02-04T17:00:00.000Z','07:00 opens a daily test until server-defined 22:00');
  const answers=Object.fromEntries(one.m.questions.map((q,i)=>[q.question_id,one.m.answer_key[i]]));
  const submission={run_id:one.m._id,mock_id:one.m.external_mock_id,version:one.m.version,nonce:start.data.attempt.nonce,answers};
  await at('08:17:00');let submitted=await api(u,'submit',submission);
  ok(submitted.status===200&&!('correct' in submitted.data)&&new Date(submitted.data.results_available_at).toISOString()==='2031-02-04T17:10:00.000Z','submission saves a receipt and withholds scores until 22:10');
  ok((await api(u,'review',{run_id:one.m._id})).status===400&&(await api(v,'results')).data.results.length===0,'own review and shared results cannot reveal an early score');
  let list=(await api(u,'list')).data;
  ok(!list.mocks.some(m=>m.run_id===one.m._id)&&list.history.some(h=>!h.review_ready&&!('correct' in h)),'completed daily MOCK leaves the unworked list while a locked dated receipt remains');
  const second=await paper('B');start=await api(v,'start',{run_id:second.m._id});
  await at('22:00:00');ok((await api(w,'start',{run_id:second.m._id})).status===400,'22:00 stops new attempts');
  ok((await service.accept(second.m,{id:v},second.m.answer_key,start.data.attempt.nonce)).reason==='closed','22:00 blocks late answers at database level');
  await at('22:09:59');ok((await api(u,'review',{run_id:one.m._id})).status===400,'the ten-minute results embargo remains after tests close');
  const sent=[];const delivery={sendMessage:async(chat,text,opts)=>{sent.push({chat,text,opts});return {message_id:sent.length};}};
  await service.publishDaily(delivery,g,new Date());ok(!sent.length,'group results reminder never sends before 22:10');
  await at('22:10:00');let review=await api(u,'review',{run_id:one.m._id});
  ok(review.status===200&&review.data.result.correct===30,'22:10 unlocks authenticated read-only analysis');
  const board=(await api(u,'results')).data;
  ok((await api(v,'results',{telegram_id:u,student_id:u})).data.results.length===0,'another member cannot read a student score or override the signed-in ID');
  ok(board.results.length===1&&board.results[0].name==='Daily '+u&&board.results[0].correct===30&&board.results[0].submitted_at==='2031-02-04T03:17:00.000Z','personal results bind only the signed-in student’s paper, score and submission time');
  await service.publishDaily(delivery,g,new Date());await service.publishDaily(delivery,g,new Date());
  ok(sent.length===2&&sent[0].text.includes('30/30')&&sent[0].text.includes('Daily '+u)&&sent[1].opts.reply_markup.inline_keyboard[0][0].text.includes('Natijangizni'),'22:10 sends the daily group ranking and a personal-results button once');
  // Reopen at 08:00 for room tests; daily submissions remain immutable.
  await at('08:00:00');const duel=await paper('DUEL');
  let created=await api(u,'room-create',{group_id:g._id,capacity:2});const room=created.data.room;
  ok(created.status===200&&room.capacity===2&&room.is_host&&room.code.length===8,'a member creates a private two-player room with a shareable code');
  ok((await api(out,'room-join',{code:room.code})).status===400,'nonmembers cannot join a room even with its code');
  ok((await api(u,'room-start',{room_id:room.id,run_id:duel.m._id})).status===400,'host cannot start before every seat is filled');
  const joined=await Promise.all([api(v,'room-join',{code:room.code}),api(w,'room-join',{code:room.code})]);
  ok(joined.filter(x=>x.status===200).length===1&&(await Room.findById(room.id)).members.length===2,'concurrent room joins cannot exceed capacity');
  const rival=(await Room.findById(room.id)).members.find(id=>id!==u);
  ok((await api(rival,'room-start',{room_id:room.id,run_id:duel.m._id})).status===400,'only the host can select and start the competition');
  ok((await api(u,'room-start',{room_id:room.id,run_id:one.m._id})).status===400,'a paper already completed by any participant is rejected');
  const started=await api(u,'room-start',{room_id:room.id,run_id:duel.m._id});
  ok(started.status===200&&started.data.room.state==='active'&&new Date(started.data.room.ends_at)-new Date()===3600_000,'starting reserves a common unseen paper and gives both players the same deadline');
  ok((await api(u,'start',{run_id:duel.m._id})).status===400,'active competition reserves the paper against a parallel daily attempt');
  const rm=await Mock.findById(started.data.room.run_id);
  ok((await api(out,'start',{run_id:rm._id})).status===400,'knowing a competition run ID cannot bypass membership');
  const a=await api(u,'start',{run_id:rm._id}),b=await api(rival,'start',{run_id:rm._id});
  ok(a.status===200&&b.status===200&&!JSON.stringify(a.data).includes('answer_key'),'participants open the same key-free competition paper');
  await service.accept(rm,{id:u},rm.answer_key,a.data.attempt.nonce);
  let state=(await api(u,'room-state',{room_id:room.id})).data.room;
  ok(!state.scores&&!state.winners&&state.members.filter(m=>m.submitted).length===1,'first finisher sees only progress, never the opponent score or winner');
  const wrong=[...rm.answer_key];wrong[0]=wrong[0]==='A'?'B':'A';await service.accept(rm,{id:rival},wrong,b.data.attempt.nonce);
  state=(await api(u,'room-state',{room_id:room.id})).data.room;
  ok(state.state==='finished'&&state.winners.length===1&&state.winners[0]===u&&state.scores[0].correct===30,'the winner is revealed only after both players submit');
  ok((await service.accept(rm,{id:rival},wrong,b.data.attempt.nonce)).duplicate===true,'last-player network retries are idempotent even after room completion');
  ok((await api(u,'review',{run_id:rm._id})).status===400,'competition winner does not leak answer keys before 22:10');
  ok((await api(out,'room-state',{room_id:room.id})).status===400,'room results are restricted to participants');
  const three=await paper('THREE'),tr=(await api(u,'room-create',{group_id:g._id,capacity:3})).data.room;
  await api(v,'room-join',{code:tr.code});await api(w,'room-join',{code:tr.code});
  const trStart=(await api(u,'room-start',{room_id:tr.id,run_id:three.m._id})).data.room;
  const tm=await Mock.findById(trStart.run_id);
  for(const id of [u,v,w]){const attempt=await service.begin(tm,{id});await service.accept(tm,{id},tm.answer_key,attempt.nonce);}
  state=(await api(u,'room-state',{room_id:tr.id})).data.room;
  ok(state.winners.length===3&&state.scores.length===3,'three-player equal scores produce a draw without arbitrary tie-breaking');
  const waiting=(await api(v,'room-create',{group_id:g._id,capacity:2})).data.room;
  await at('08:31:00');ok((await api(w,'room-join',{code:waiting.code})).status===400,'waiting rooms expire after 30 minutes');
  const partial=await paper('PARTIAL'),pr=(await api(u,'room-create',{group_id:g._id,capacity:2})).data.room;
  await api(v,'room-join',{code:pr.code});const prStart=(await api(u,'room-start',{room_id:pr.id,run_id:partial.m._id})).data.room;
  const pm=await Mock.findById(prStart.run_id),pa=await service.begin(pm,{id:u});await service.accept(pm,{id:u},pm.answer_key,pa.nonce);
  await at('09:32:00');const ended=(await api(u,'room-state',{room_id:pr.id})).data.room;
  ok(ended.state==='expired'&&!ended.winners&&!ended.scores,'an unfinished competition expires without inventing a winner');
  await at('07:00:00','2031-02-05');const nextDay=await api(v,'start',{run_id:second.m._id});
  ok(nextDay.status===200&&nextDay.data.attempt.nonce!==start.data.attempt.nonce,'an unfinished daily test reopens next morning with a fresh attempt nonce');
  ok((await service.accept(second.m,{id:v},second.m.answer_key,start.data.attempt.nonce)).reason==='stale','yesterday’s nonce cannot submit in today’s window');
  await db.exec('set role service_role');const serviceCheck=await raw(u,'create',{group_id:g._id,capacity:2});await db.exec('reset role');
  ok(serviceCheck.ok,'the deployed service_role can execute room RPCs');
  await deletePackage(duel.p._id);
  ok(!await Room.findById(room.id)&&!await Submission.exists({mock_id:rm._id}),'MOCK deletion also removes room copies and their saved results');
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query("select public.bio_room_action($1,'create','{}')",[u]),/permission denied/);await db.exec('reset role');}
  checks.push('public database roles cannot mutate competition rooms');
 }finally{mockTimers.timers.reset();await db.exec(originalClock);}
};
