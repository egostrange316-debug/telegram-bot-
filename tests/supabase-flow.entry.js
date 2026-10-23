// Runs against an isolated local Postgres (PGlite) with the production schema.
// Telegram and Gemini are mocked; all bot handlers and database operations run.
const config = require('../src/config');
const models = require('../src/storage/postgres');
const { createBot } = require('../src/bot');
const { sectionState } = require('../src/bot/tests');
const attendance = require('../src/bot/attendance');
const payments = require('../src/bot/payments');
const { userResults } = require('../src/lib/stats');
const { dateKey } = require('../src/lib/time');
module.exports = async function run(rpc) {
  models.configureDatabase(rpc);
  Object.assign(config, { BOT_TOKEN: '123456789:TEST_ONLY', GEMINI_API_KEY: 'fixture-key', ADMIN_IDS: [991000009], CHART_URL: '' });
  const { User, GroupChat, Test, ScreenshotResult, BotSession, Attendance } = models;
  const checks = [], calls = []; let seq = 1;
  const assert = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const bot = createBot({ screenshots: {
    async downloadScreenshot() { return {bytes: Buffer.from('supabase-fixture-image'),mime:'image/png'}; },
    async readScreenshot() { return {title:'SQL flow test',score_type:'correct',score:27,maximum:40,percent:67.5}; },
  } });
  bot.botInfo = {id:123456789,is_bot:true,first_name:'Test',username:'enzo_fixture_bot'};
  bot.api.config.use(async (_prev,method,payload) => {
    calls.push({method,payload});
    if (method==='getChatMember') return {ok:true,result:{status:'administrator',user:{id:payload.user_id}}};
    return {ok:true,result:{message_id:seq++,date:1,chat:{id:payload.chat_id,type:'private'},text:payload.text}};
  });
  const from=id=>({id,is_bot:false,first_name:'Fixture'});
  const msg=(id,text,extra={},chatId=id)=>bot.handleUpdate({update_id:seq++,message:{message_id:seq++,date:1,from:from(id),chat:{id:chatId,type:chatId<0?'supergroup':'private',title:'Fixture group'},...(text===null?{}:{text}),...(text?.startsWith('/')?{entities:[{type:'bot_command',offset:0,length:text.split(' ')[0].length}]}:{}),...extra}});
  const cb=(id,data)=>bot.handleUpdate({update_id:seq++,callback_query:{id:String(seq++),from:from(id),chat_instance:'fixture',data,message:{message_id:10,date:1,chat:{id,type:'private'}}}});
  const uid=991000001, aid=991000009, chat=-100991000001;
  let user,group,first,second,result;
  try {
    await msg(aid,'/ulash Fixture',{},chat);
    group=await GroupChat.findOne({chat_id:chat});
    assert(group?.attendance_time==='14:00','group default schedule');
    await msg(uid,`/start join_${group._id}`);
    await msg(uid,'Fixture Student');
    user=await User.findOne({telegram_id:uid});
    assert(user?.group_ids.includes(group._id),'membership enrollment and session persistence');
    await cb(aid,'am:sec:ielts:reading'); await msg(aid,'Fixture HTML 1');
    await msg(aid,null,{document:{file_id:'fixture-html',file_unique_id:'fixture-html',file_name:'test.html',mime_type:'text/html'}});
    await msg(aid,null,{audio:{file_id:'fixture-audio',file_unique_id:'fixture-audio',duration:60}});
    await cb(aid,'ad:mdone');
    first=await Test.findOne({title:'Fixture HTML 1'});
    assert(first?.submission_mode==='screenshot'&&first.materials.length===2,'admin HTML and audio upload');
    second=await Test.create({title:'Fixture HTML 2',exam:'ielts',section:'reading',order:2,submission_mode:'screenshot',materials:[{kind:'text',text:'fixture'}]});
    await cb(uid,`mf:${first._id}`);
    assert((await BotSession.findOne({telegram_id:uid})).data.testId===first._id,'selected material persists');
    await msg(uid,null,{photo:[{file_id:'fixture-result',file_unique_id:'fixture-result',width:100,height:100,file_size:10}]});
    result=await ScreenshotResult.findOne({user:user._id});
    assert(result?.status==='draft'&&result.title===first.title&&result.score===27,'screenshot draft binds canonical material');
    await cb(uid,`ssok:${result._id}`);
    let state=await sectionState(user._id,'ielts','reading');
    assert(state.rows[1].state==='locked','analysis blocks next material');
    await msg(uid,'I confused synonyms and will review each incorrect answer carefully.');
    state=await sectionState(user._id,'ielts','reading');
    assert(state.rows[0].state==='done'&&state.rows[1].state==='open','analysis unlocks next material');
    await Attendance.create({user:user._id,date:dateKey(),status:'present'});
    await attendance.postReport(bot.api,group,dateKey(),'fixture:report');
    const sends=calls.filter(x=>x.method==='sendMessage'&&x.payload.chat_id===chat&&x.payload.text?.includes('27/40'));
    assert(sends.length===1&&sends[0].payload.text.includes('Fixture Student'),'attendance contains accepted screenshot');
    await attendance.postReport(bot.api,group,dateKey(),'fixture:report');
    assert(calls.filter(x=>x.method==='sendMessage'&&x.payload.chat_id===chat&&x.payload.text?.includes('27/40')).length===1,'scheduled delivery deduplicates');
    assert((await payments.markPaid(user._id)).ok,'payment recording');
    assert((await payments.markPaid(user._id)).reason==='already','payment repeated click');
    const history=await userResults(user._id,'ielts');
    assert(history.screenshots.length===1&&history.screenshots[0].percent===67.5,'personal results from Postgres');
    return {ok:true,checks};
  } finally {
    const clean=[['BotSession',{telegram_id:{$in:[uid,aid]}}],['TgLink',{telegram_id:uid}],['User',{telegram_id:uid}],['GroupChat',{chat_id:chat}],['Test',{title:{$in:['Fixture HTML 1','Fixture HTML 2']}}],['ScreenshotResult',{file_unique_id:'fixture-result'}],['Attendance',{user:user?._id||'none'}],['AttendanceReport',{key:'fixture:report'}],['JobLog',{key:'fixture:report:part:0'}]];
    for (const [name,filter] of clean) for(const row of await models[name].find(filter)) await models[name].deleteOne({_id:row._id});
  }
};
