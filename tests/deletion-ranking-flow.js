const assert=require('node:assert/strict');
const config=require('../src/config');
const {BioPackage:Package,BioMock:Mock,BioSubmission:Submission,BioAttempt:Attempt,BioProfile:Profile,BotSession}=require('../src/storage/postgres');
const {snapshot,deletePackage,reviewForUser}=require('../src/biology/catalog');
const {validatePackage}=require('../src/biology/importer');
const service=require('../src/biology/service');
const {handleApi}=require('../src/biology/api');
const {issueSession}=require('../src/biology/auth');
module.exports=async({msg,cb,owner,student,bot,checks,db})=>{
 const ok=(v,label)=>{assert.ok(v,label);checks.push(label);};
 const {BioGroup:Group}=require('../src/storage/postgres');
 const g=await Group.create({chat_id:-100991000070,title:'Ranking fixture'}),who=991000070;
 const base=validatePackage(require('../examples/mock-30/import.json').mock,require('../examples/mock-30/import.json').answer_key);
 let number=0;
 const paper=async(ends_at,correct)=>{
  const p=await Package.create({...base,mock_id:`RANK-${++number}`,status:'approved'});
  const m=await Mock.create({...snapshot(p),code:`f0000${number}`,group_id:g._id,status:'closed',starts_at:new Date(new Date(ends_at)-3600_000),ends_at:new Date(ends_at)});
  const s=await Submission.create({mock_id:m._id,telegram_id:who,name:'Rank student',correct,total:30,percent:correct/30*100,answers:m.answer_key,blank:0,mistakes:[],submitted_at:new Date(ends_at)});
  return {p,m,s};
 };
 // Tuesday in Tashkent. Yesterday's zero must not inflate today's denominator.
 const now=new Date('2030-01-08T16:00:00Z');
 const old=await paper('2030-01-07T15:00:00Z',0),today=await paper('2030-01-08T15:00:00Z',29);
 let daily=await service.dailyText(g._id,now,now),weekly=await service.weeklyText(g._id,now,now);
 ok(daily.includes('29/30')&&!daily.includes('29/60')&&weekly.includes('29/60'),'daily ranking isolates one Tashkent day while weekly ranking totals both days');
 const sends=[];let fail=false;
 const api={sendMessage:async(chat,text)=>{if(fail)throw Error('fixture offline');sends.push({chat,text});return {message_id:sends.length};}};
 await service.publishWeekly(api,g,now);
 ok(sends.length===0,'unfinished week does not publish a weekly total');
 const queued=await Mock.create({...snapshot(old.p),code:'f00101',group_id:g._id,status:'scheduled'});
 await Package.updateOne({_id:old.p._id},{$set:{status:'deleted'}});
 ok((await service.weeklyText(g._id,now,now)).includes('29/30'),'legacy soft-deleted package is excluded even before physical result cleanup');
 await Attempt.create({mock_id:old.m._id,telegram_id:who,state:'submitted',draft:{Q001:'A'},retake_allowed:true});
 await Profile.create({telegram_id:who,name:'Rank student',group_ids:[g._id],pending:{mock_id:old.m._id,answers:['A']}});
 await BotSession.create({telegram_id:who,data:{step:'bio_answer',data:{mock_id:old.m._id}}});
 // A running worker cannot insert a new scheduled run of a deleted package.
 await assert.rejects(Mock.create({...snapshot(old.p),code:'f00102',group_id:g._id,status:'scheduled'}).exec(),/MOCK package deleted/);
 checks.push('database rejects stale creation of a deleted package run');
 await msg(owner,'🛠 Admin rejimi');await cb(student,`cd:${old.p._id}`);
 ok(await Submission.exists({_id:old.s._id}),'student cannot delete a MOCK or its answers');
 await cb(owner,`cd:${old.p._id}`);
 const removed=await Mock.findById(old.m._id),pkg=await Package.findById(old.p._id);
 ok(removed.status==='deleted'&&pkg.status==='deleted'&&!removed.questions&&!removed.answer_key&&!pkg.answer_key&&
  !await Submission.exists({mock_id:old.m._id})&&!await Attempt.exists({mock_id:old.m._id}),
  'owner deletion erases saved answers, attempts, keys and question content with disabled tombstones');
 ok(!(await Profile.findOne({telegram_id:who})).pending&&!await BotSession.exists({telegram_id:who})&&(await Mock.findById(queued._id)).status==='deleted',
  'deletion clears pending answer/session copies and all related runs');
 ok((await Submission.findById(today.s._id)).correct===29&&(await Mock.findById(today.m._id)).status==='closed','deleting a MOCK preserves unrelated results');
 config.MINIAPP_URL='https://biology.example';
 const call=async(action,body)=>{const r=await handleApi(new Request('https://api.example/api/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${issueSession({id:who,first_name:'Rank student'},config.BOT_TOKEN)}`},body:JSON.stringify(body)}),{api:bot.api});return {status:r.status,data:await r.json()};};
 const list=await call('list',{});
 ok(!list.data.mocks.some(m=>m.run_id===old.m._id)&&!list.data.history.some(m=>m.run_id===old.m._id),'deleted MOCK disappears from Mini App test and result lists');
 ok((await call('start',{run_id:old.m._id})).status===400&&(await call('review',{run_id:old.m._id})).status===400,'old test and analysis links cannot reopen a deleted MOCK');
 await assert.rejects(reviewForUser({id:who},old.m._id));
 const again=await deletePackage(old.p._id);
 ok(again.submissions===0&&again.attempts===0,'repeated deletion is idempotent');
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);await assert.rejects(db.query('select public.bio_delete_package($1)',[today.p._id]),/permission denied/);await db.exec('reset role');
 }
 checks.push('public database roles cannot invoke destructive MOCK cleanup');
 const monday=new Date('2030-01-13T19:00:00Z');
 await service.publishWeekly(api,g,new Date(monday-1));ok(!sends.length,'weekly report stays closed until Monday 00:00 Tashkent');
 fail=true;await assert.rejects(service.publishWeekly(api,g,monday));fail=false;
 await service.publishWeekly(api,g,new Date(monday.getTime()+60000));await service.publishWeekly(api,g,new Date(monday.getTime()+120000));
 ok(sends.length===1&&sends[0].text.includes('Haftalik yakun')&&sends[0].text.includes('29/30')&&sends[0].text.includes('2030-01-07')&&sends[0].text.includes('2030-01-13'),
  'weekly report retries failures, excludes deleted results and sends the finished week once');
 const boundary=await paper('2030-01-13T19:00:00Z',20);
 ok((await service.weeklyText(g._id,new Date(monday-1),monday)).includes('29/30')&&(await service.dailyText(g._id,monday,monday)).includes('20/30'),
  'Monday midnight belongs to the new day/week without leaking into the previous week');
 // Finished test delivery is daily, never an interim weekly message.
 sends.length=0;await Mock.updateOne({_id:boundary.m._id},{$set:{reported:false}});
 await service.closeMock(api,g,await Mock.findById(boundary.m._id),monday);
 ok(sends.some(s=>s.text.includes('Kunlik reyting'))&&!sends.some(s=>s.text.includes('Haftalik')),'test closure sends a daily report instead of an unfinished weekly total');
};
