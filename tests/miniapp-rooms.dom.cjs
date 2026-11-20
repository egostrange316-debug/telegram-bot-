const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const root=path.join(__dirname,'..','miniapp');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),script=fs.readFileSync(path.join(root,'app.js'),'utf8');
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
(async()=>{
 for(const capacity of [4,6]){
  const dom=new JSDOM(html,{url:'https://biology.example/?tab=arena',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id),calls=[];
  const names=['Jahongir','Muhammadali','Zaynab','Abdulaziz','Shahzoda','Ibrohim'];
  let room={id:'room-fixture',code:'A1B2C3D4',capacity,state:'waiting',is_host:true,members:[{id:1,name:names[0],is_me:true}],mocks:[{run_id:'paper-fixture',title:'Hujayra',question_count:30}]};
  w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.Telegram={WebApp:{initData:'fixture',ready(){},expand(){}}};
  w.fetch=async(url,init)=>{
   const action=url.split('/').at(-1),body=JSON.parse(init.body);calls.push({action,body});
   let data={};
   if(action==='session')data={token:'fixture',user:{id:1,name:names[0]}};
   if(action==='list')data={mocks:[],history:[],groups:[{id:'group-fixture',title:'Biologiya'}],rooms:[{id:room.id,code:room.code}]};
   if(action==='room-create'||action==='room-state')data={room};
   if(action==='room-start'){room={...room,state:'active',title:'Hujayra',run_id:'run-fixture',ends_at:new Date(Date.now()+600000).toISOString()};data={room};}
   return {ok:true,json:async()=>data};
  };
  w.eval(script);await settle();
  assert.deepEqual([...$('roomCapacity').options].map(o=>o.value),['2','3','4','6']);
  $('roomCapacity').value=String(capacity);$('createRoom').click();await settle();
  const sent=calls.find(c=>c.action==='room-create');assert.equal(sent.body.capacity,capacity);
  assert.equal($('roomMembers').children.length,capacity);assert.equal($('roomMembers').dataset.capacity,String(capacity));
  assert.match($('roomStatus').textContent,new RegExp('1/'+capacity+' qatnashchi'));assert.equal($('startRoom').disabled,true);
  room={...room,members:names.slice(0,capacity).map((name,i)=>({id:i+1,name,is_me:i===0,submitted:false}))};
  async function reopen(){ $('arenaHome').click();await settle();$('recentRooms').querySelector('button').click();await settle(); }
  await reopen();assert.equal($('roomMembers').querySelectorAll('strong').length,capacity);assert.equal($('startRoom').disabled,false);
  $('startRoom').click();await settle();assert.equal($('enterRoomExam').hidden,false);assert.equal($('roomScores').children.length,0);
  assert.match($('roomStatus').textContent,new RegExp('0/'+capacity+' topshirdi'));
  room={...room,state:'finished',members:room.members.map(m=>({...m,submitted:true})),winners:[1],scores:room.members.map((m,i)=>({...m,correct:30-i,total:30}))};
  await reopen();assert.equal($('roomScores').querySelectorAll('.result-row').length,capacity);assert.match($('roomScores').querySelector('.winner-banner').textContent,/Jahongir/);
  assert.equal($('enterRoomExam').hidden,true);assert.match($('roomScores').textContent,/22:10/);
  dom.window.close();console.log(`PASS: ${capacity}-player selection, request payload, waiting slots, start readiness and final score rows`);
 }
})().catch(error=>{console.error(error);process.exit(1);});
