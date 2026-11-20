const {randomBytes}=require('crypto');
const {BioRoom:Room,BioMock:Mock,BioSubmission:Submission,BioAttempt:Attempt,BioProfile:Profile,BioGroup:Group,roomAction}=require('../storage/postgres');
const {InputError}=require('./domain');
const service=require('./service');
const errors={rate:'Juda ko‘p xona urinishlari. Keyingi soatda qayta urinib ko‘ring.',membership:'Avval shu guruhga qo‘shiling.',capacity:'Xona 2, 3, 4 yoki 6 kishilik bo‘ladi.',busy:'Sizda hali tugamagan xona yoki urinish bor.',missing:'Xona topilmadi. Kodni tekshiring.',closed:'Xona yopilgan yoki muddati tugagan.',full:'Xona to‘lgan.',owner:'Faqat xona egasi boshlaydi.',waiting:'Barcha qatnashchilar qo‘shilishini kuting.',hours:'Musobaqalar 07:00–22:00 oralig‘ida ochiq.',paper:'Bu MOCK musobaqa uchun ochiq emas.',used:'Bu MOCKni qatnashchilardan biri ishlagan yoki boshlab qo‘ygan. Boshqasini tanlang.'};
async function authorize(api,user,groupId){const g=await Group.findById(groupId);await service.enroll(api,user,g);return g;}
async function candidates(room) {
  const mocks=await Mock.find({group_id:room.group_id,status:'daily'}).sort({createdAt:-1}).limit(1000);
  const all=await Mock.find({});const byId=new Map(all.map(m=>[m._id,m]));
  const rows=await Submission.find({telegram_id:{$in:room.members}});
  const attempts=await Attempt.find({telegram_id:{$in:room.members},state:'active',ends_at:{$gt:new Date()}});
  const used=new Set([...rows,...attempts].map(s=>{const m=byId.get(s.mock_id);return m?.package_id||s.mock_id;}));
  return mocks.filter(m=>m.questions&&!used.has(m.package_id||m._id)).map(m=>({run_id:m._id,title:m.title,topics:m.topics||[],question_count:m.count}));
}
async function state(api,user,id) {
  const room=await Room.findById(id);
  if(!room||!room.members.includes(user.id))throw new InputError('Bu xona sizga tegishli emas.');
  await authorize(api,user,room.group_id);
  const profiles=await Profile.find({telegram_id:{$in:room.members}}),names=new Map(profiles.map(p=>[p.telegram_id,p.name]));
  const submissions=room.run_id?await Submission.find({mock_id:room.run_id}):[];
  const allDone=submissions.length===room.members.length&&room.state!=='waiting';
  const expired=room.state==='waiting'?new Date(room.expires_at)<=new Date():room.state==='active'&&new Date(room.ends_at)<=new Date();
  const status=allDone?'finished':expired?'expired':room.state;
  const result={id:room._id,code:room.code,state:status,capacity:room.capacity,is_host:room.host_id===user.id,run_id:room.run_id,title:room.title,ends_at:room.ends_at,expires_at:room.expires_at,
    members:room.members.map(id=>({id,name:names.get(id)||'O‘quvchi',is_me:id===user.id,submitted:submissions.some(s=>s.telegram_id===id)}))};
  if(status==='waiting'&&result.is_host)result.mocks=await candidates(room);
  if(allDone){
    result.scores=submissions.map(s=>({id:s.telegram_id,name:s.name,correct:s.correct,total:s.total,submitted_at:s.submitted_at})).sort((a,b)=>b.correct-a.correct||a.id-b.id);
    const best=result.scores[0]?.correct;result.winners=result.scores.filter(s=>s.correct===best).map(s=>s.id);
  }
  return result;
}
async function mutate(api,user,action,body) {
  let room;
  if(action==='create')await authorize(api,user,body.group_id);
  else {room=action==='join'?await Room.findOne({code:String(body.code||'').trim().toUpperCase()}):await Room.findById(body.room_id);
    if(!room)throw new InputError(errors.missing);await authorize(api,user,room.group_id);}
  if(action==='start'){
    if(room.host_id!==user.id)throw new InputError(errors.owner);
    // Recheck every participant against Telegram immediately before the start.
    for(const id of room.members)await authorize(api,{id},room.group_id);
  }
  const payload={group_id:body.group_id,capacity:Number(body.capacity),room_id:room?._id,run_id:body.run_id,
    code:action==='create'?randomBytes(4).toString('hex').toUpperCase():String(body.code||'').trim().toUpperCase(),new_id:randomBytes(12).toString('hex'),run_code:randomBytes(3).toString('hex')};
  if(action==='create'&&![2,3,4,6].includes(payload.capacity))throw new InputError(errors.capacity);
  const r=await roomAction({p_user:user.id,p_action:action,p_payload:payload});
  if(!r.ok)throw new InputError(errors[r.reason]||'Xonadagi amal bajarilmadi.');
  if(action==='leave')return {left:true};
  return state(api,user,r.room._id);
}
module.exports={state,mutate};
