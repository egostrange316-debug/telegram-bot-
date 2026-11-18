const { Api } = require('grammy');
const config = require('../config');
const { BioMock: Mock, BioProfile: Profile, BioGroup: Group, BioSubmission: Submission, BioRoom:Room } = require('../storage/postgres');
const { AuthError,validateInitData,issueSession,verifySession } = require('./auth');
const { InputError } = require('./domain');
const { boundedBytes,parseJSON } = require('./importer');
const { openForUser,publicMock,reviewReady,reviewForUser } = require('./catalog');
const service = require('./service');
const rooms=require('./rooms');
const {windowFor,isOpen,releaseAt}=require('./timing');
function answerArray(m,choices) {
  if (!choices || typeof choices!=='object' || Array.isArray(choices)) throw new InputError('answers obyekti kerak.');
  const ids=new Set(m.questions.map(q=>q.question_id));
  for (const [id,choice] of Object.entries(choices)) if (!ids.has(id) || !['A','B','C','D','-'].includes(choice)) throw new InputError(`${id.slice(0,64)}: javob yaroqsiz.`);
  if (Object.keys(choices).length!==m.count) throw new InputError('Har bir savolga javob yoki - yuboring.');
  return m.questions.map(q=>choices[q.question_id]);
}
async function handleApi(req, options={}) {
  const allowed=config.MINIAPP_URL ? new URL(config.MINIAPP_URL).origin : '', origin=req.headers.get('origin');
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',Vary:'Origin'};
  if (origin===allowed && allowed) Object.assign(headers,{'access-control-allow-origin':origin,'access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'});
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if (origin && origin!==allowed) return reply({error:'Origin ruxsat etilmagan.'},403);
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (req.method!=='POST') return reply({error:'POST kerak.'},405);
  try {
    const body=parseJSON(new TextDecoder().decode(await boundedBytes({ok:true,headers:req.headers,body:req.body},16384)),'API');
    if (!body || typeof body!=='object' || Array.isArray(body)) throw new InputError('API JSON obyekti kerak.');
    const action=new URL(req.url).pathname.split('/').at(-1);
    if (action==='session') {
      const user=validateInitData(body.init_data,config.BOT_TOKEN);
      await service.profile(user);
      return reply({token:issueSession(user,config.BOT_TOKEN),user:{id:user.id,name:[user.first_name,user.last_name].filter(Boolean).join(' ')}});
    }
    const user=verifySession((req.headers.get('authorization')||'').replace(/^Bearer /,''),config.BOT_TOKEN);
    const api=options.api || new Api(config.BOT_TOKEN);
    if (action==='room-state') return reply({room:await rooms.state(api,user,body.room_id),server_time:new Date().toISOString()});
    if (['room-create','room-join','room-start','room-leave'].includes(action))
      return reply({room:await rooms.mutate(api,user,action.slice(5),body),server_time:new Date().toISOString()});
    if (action==='list' || action==='results') {
      const p=await Profile.findOne({telegram_id:user.id});
      const groups=await Group.find({_id:{$in:p?.group_ids || []},enabled:true});
      const all=await Mock.find({group_id:{$in:groups.map(g=>g._id)},status:{$in:['daily','scheduled','opening','open','closed']}});
      const byId=new Map(all.map(m=>[m._id,m]));
      if(action==='results') {
        // Group-wide results are available only to current Telegram members.
        const selected=groups.filter(g=>!body.group_id||g._id===body.group_id);
        for(const g of selected)await service.enroll(api,user,g);
        const ids=new Set(selected.map(g=>g._id));
        const source=all.filter(m=>ids.has(m.group_id));
        const rows=await Submission.find({mock_id:{$in:source.map(m=>m._id)}}).sort({submitted_at:-1,_id:1}).limit(2000);
        const visible=rows.filter(r=>reviewReady(byId.get(r.mock_id),Date.now(),r)).map(r=>{
          const m=byId.get(r.mock_id);return {id:r._id,run_id:r.mock_id,name:r.name,student_id:r.telegram_id,is_me:r.telegram_id===user.id,title:m.title,topics:m.topics||[],group_id:m.group_id,
            correct:r.correct,total:r.total,percent:r.percent,started_at:r.started_at,submitted_at:r.submitted_at,kind:m.room_id?'room':'daily'};
        });
        return reply({results:visible,groups:groups.map(g=>({id:g._id,title:g.title})),server_time:new Date().toISOString()});
      }
      const submissions=await Submission.find({telegram_id:user.id}).sort({submitted_at:-1,_id:1}).limit(2000);
      const used=new Set(submissions.map(s=>byId.get(s.mock_id)?.package_id||s.mock_id));
      const history=submissions.filter(s=>byId.has(s.mock_id)).map(s=>{const m=byId.get(s.mock_id);return {
        run_id:m._id,title:m.title,topics:m.topics||[],mock_id:m.external_mock_id||m.code,
        ...(reviewReady(m,Date.now(),s)?{correct:s.correct,total:s.total,percent:s.percent}:{}),
        ends_at:releaseAt(m,s),available_at:releaseAt(m,s),review_ready:reviewReady(m,Date.now(),s),started_at:s.started_at,submitted_at:s.submitted_at,
      };});
      const activeRooms=await Room.find({members:user.id}).sort({created_at:-1}).limit(10);
      const list=all.filter(m=>m.questions&&!m.room_id&&(m.status==='daily'||['scheduled','opening','open'].includes(m.status)&&new Date(m.ends_at)>new Date())&&!used.has(m.package_id||m._id));
      return reply({mocks:list.map(m=>({run_id:m._id,mock_id:m.external_mock_id,version:m.version,title:m.title,topics:m.topics||[],question_count:m.count,...windowFor(m),status:m.status,is_open:isOpen(m)})),history,
        groups:groups.map(g=>({id:g._id,title:g.title})),rooms:activeRooms.map(r=>({id:r._id,code:r.code,state:r.state,title:r.title,ends_at:r.ends_at,expires_at:r.expires_at})),server_time:new Date().toISOString()});
    }
    if (!['start','submit','review'].includes(action)) return reply({error:'Topilmadi.'},404);
    if (!/^[a-f0-9]{24}$/.test(body.run_id||'')) throw new InputError('Mock tanlanmagan.');
    if(action==='review') return reply({...await reviewForUser(user,body.run_id),server_time:new Date().toISOString()});
    if(action==='start') {
      const {m,attempt}=await openForUser(api,user,body.run_id);
      return reply({mock:publicMock(m),attempt,server_time:new Date().toISOString()});
    }
    const m=await Mock.findById(body.run_id);
    if (!m?.questions || body.mock_id!==m.external_mock_id || body.version!==m.version) throw new InputError('MOCK ID yoki version mos kelmadi.');
    // Recheck membership at submission; all time/attempt checks are atomic in SQL.
    await service.enroll(api,user,await Group.findById(m.group_id));
    if (!/^[a-f0-9]{32}$/.test(body.nonce||'')) throw new InputError('Urinish kaliti yaroqsiz.');
    const accepted=service.accepted(await service.accept(m,user,answerArray(m,body.answers),body.nonce));
    // Grade on the server now, but do not send scores or answer correctness to
    // the student until the shared deadline, even on idempotent retries.
    return reply({ok:true,received:true,results_available_at:accepted.available_at||releaseAt(m),room_id:m.room_id,mock_id:m.external_mock_id,version:m.version});
  } catch(e) {
    if(e instanceof AuthError) return reply({error:e.message},401);
    if(e instanceof InputError) return reply({error:e.message},400);
    return reply({error:'Vaqtincha uzilish. Javoblaringizni saqlab, qayta urinib ko‘ring.'},503);
  }
}
module.exports={handleApi,answerArray};
