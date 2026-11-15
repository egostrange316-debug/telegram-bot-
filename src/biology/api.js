const { Api } = require('grammy');
const config = require('../config');
const { BioMock: Mock, BioProfile: Profile, BioGroup: Group } = require('../storage/postgres');
const { AuthError,validateInitData,issueSession,verifySession } = require('./auth');
const { InputError } = require('./domain');
const { boundedBytes,parseJSON } = require('./importer');
const { openForUser,publicMock } = require('./catalog');
const service = require('./service');
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
    if (action==='list') {
      const p=await Profile.findOne({telegram_id:user.id});
      const groups=await Group.find({_id:{$in:p?.group_ids || []},enabled:true});
      const mocks=await Mock.find({group_id:{$in:groups.map(g=>g._id)},status:{$in:['scheduled','opening','open']}}).sort({starts_at:1}).limit(30);
      return reply({mocks:mocks.filter(m=>m.questions).map(m=>({run_id:m._id,mock_id:m.external_mock_id,version:m.version,title:m.title,question_count:m.count,starts_at:m.starts_at,ends_at:m.ends_at,status:m.status})),server_time:new Date().toISOString()});
    }
    if (!['start','submit'].includes(action)) return reply({error:'Topilmadi.'},404);
    if (!/^[a-f0-9]{24}$/.test(body.run_id||'')) throw new InputError('Mock tanlanmagan.');
    if(action==='start') {
      const {m,attempt}=await openForUser(api,user,body.run_id);
      return reply({mock:publicMock(m),attempt,server_time:new Date().toISOString()});
    }
    const m=await Mock.findById(body.run_id);
    if (!m?.questions || body.mock_id!==m.external_mock_id || body.version!==m.version) throw new InputError('MOCK ID yoki version mos kelmadi.');
    // Recheck membership at submission; all time/attempt checks are atomic in SQL.
    await service.enroll(api,user,await Group.findById(m.group_id));
    if (!/^[a-f0-9]{32}$/.test(body.nonce||'')) throw new InputError('Urinish kaliti yaroqsiz.');
    const result=service.accepted(await service.accept(m,user,answerArray(m,body.answers),body.nonce));
    return reply({ok:true,correct:result.correct,total:result.total,wrong:result.total-result.correct,percent:result.percent,mock_id:m.external_mock_id,version:m.version});
  } catch(e) {
    if(e instanceof AuthError) return reply({error:e.message},401);
    if(e instanceof InputError) return reply({error:e.message},400);
    return reply({error:'Vaqtincha uzilish. Javoblaringizni saqlab, qayta urinib ko‘ring.'},503);
  }
}
module.exports={handleApi,answerArray};
