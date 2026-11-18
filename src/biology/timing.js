const { dayStart } = require('./domain');
function windowFor(mock, now = new Date()) {
  if (mock?.status !== 'daily') return { starts_at:mock?.starts_at, ends_at:mock?.ends_at, available_at:mock?.available_at || mock?.ends_at };
  const day=dayStart(now).getTime();
  return {starts_at:new Date(day+7*3600_000),ends_at:new Date(day+22*3600_000),available_at:new Date(day+(22*60+10)*60_000)};
}
function isOpen(mock,now=new Date()) {
  const w=windowFor(mock,now);
  return ['daily','open'].includes(mock?.status) && new Date(w.starts_at)<=now && now<new Date(w.ends_at);
}
const releaseAt=(mock,submission)=>mock?.status==='daily'||mock?.room_id ? submission?.available_at || mock?.available_at || windowFor(mock).available_at : mock?.ends_at;
module.exports={windowFor,isOpen,releaseAt};
