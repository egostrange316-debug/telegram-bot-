const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const root=path.join(__dirname,'..','miniapp');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'), script=fs.readFileSync(path.join(root,'app.js'),'utf8');
const run='a'.repeat(24), past=new Date(Date.now()-60000).toISOString(), future=new Date(Date.now()+600000).toISOString();
const questions=[
 {question_id:'Q001',number:1,source_topic:'50',text:'<img src=x onerror=alert(1)> Hujayraning irsiy axboroti qayerda saqlanadi?',options:{A:'Yadroda',B:'Vakuolada',C:'Hujayra devorida',D:'Ribosomada'},selected_answer:'B',correct_answer:'A',is_correct:false},
 {question_id:'Q002',number:2,source_topic:'51',text:'Fotosintez qaysi organoidda sodir bo‘ladi?',options:{A:'Mitoxondriya',B:'Ribosoma',C:'Xloroplast',D:'Yadro'},selected_answer:'-',correct_answer:'C',is_correct:false},
 {question_id:'Q003',number:3,source_topic:'52',text:'Irsiyat birligi nima?',options:{A:'Gen',B:'To‘qima',C:'Organ',D:'Hujayra'},selected_answer:'A',correct_answer:'A',is_correct:true}
];
const review={mock:{run_id:run,mock_id:'BIO-DEMO',title:'Biologiya MOCK — tahlil',question_count:3},result:{correct:1,total:3,percent:33.3},questions,server_time:new Date().toISOString()};
async function setup(search,mode='review'){
 const dom=new JSDOM(html,{url:'https://biology.example/'+search,runScripts:'outside-only'}),w=dom.window,calls=[];
 w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.Telegram={WebApp:{initData:mode==='outside'?'':'fixture',ready(){},expand(){}}};
 w.fetch=async(url,init)=>{const action=url.split('/').at(-1);calls.push({action,body:JSON.parse(init.body)});
  let status=200,data={};
  if(action==='session')data={token:'fixture',user:{id:1,name:'Sinov'}};
  if(action==='list')data={mocks:[],history:mode==='exam'?[]:[{run_id:run,title:'Tugallangan test',correct:1,total:3,percent:33.3,ends_at:past,review_ready:true}],server_time:new Date().toISOString()};
  if(action==='review'){data=review;if(mode==='locked'){status=400;data={error:'Tahlil testning umumiy vaqti tugagach ochiladi.'};}}
  if(action==='start')data={mock:{run_id:run,mock_id:'BIO-DEMO',version:1,title:'Sinov',question_count:3,ends_at:future,questions},attempt:{nonce:'fixture'},server_time:new Date().toISOString()};
  if(action==='submit')data={ok:true,received:true,results_available_at:future};
  return {ok:status===200,json:async()=>data};
 };
 w.eval(script);await new Promise(r=>setTimeout(r,20));return {dom,w,calls,$:id=>w.document.getElementById(id)};
}
(async()=>{
 let t=await setup('?run='+run+'&mode=review');
 assert.equal(t.$('analysis').hidden,false);assert.equal(t.$('analysisOptions').children.length,4);
 assert.equal(t.w.document.querySelectorAll('#analysisOptions button').length,0);assert.equal(t.w.document.querySelectorAll('#analysisQuestion img').length,0);
 assert.match(t.$('analysisAnswer').textContent,/Sizning javobingiz: B. To‘g‘ri javob: A/);
 t.$('errorsOnly').click();assert.equal(t.$('analysisNumbers').children.length,2);t.$('analysisNext').click();assert.match(t.$('analysisStatus').textContent,/Bo‘sh/);
 t.$('analysisOptions').firstElementChild.click();assert.ok(t.calls.every(c=>!['start','submit'].includes(c.action)));
 t.$('analysisHome').click();await new Promise(r=>setTimeout(r,20));assert.equal(t.$('historyList').children.length,1);
 t.$('historyList').querySelector('button').click();await new Promise(r=>setTimeout(r,20));assert.equal(t.$('analysis').hidden,false);t.dom.window.close();
 console.log('PASS: read-only navigation, wrong/blank filter, history reopen, XSS text escaping; no start/submit requests');
 t=await setup('?run='+run+'&mode=review','locked');assert.equal(t.$('analysisContent').hidden,true);assert.match(t.$('analysisError').textContent,/umumiy vaqti/);assert.equal(t.$('analysisOptions').children.length,0);t.dom.window.close();
 console.log('PASS: server lock cannot expose question answers');
 t=await setup('?run='+run,'exam');t.$('finish').click();t.$('submit').click();await new Promise(r=>setTimeout(r,20));assert.equal(t.$('result').hidden,false);assert.equal(t.$('resultAnalysis').disabled,true);assert.match(t.$('result').textContent,/hozircha yopiq/);assert.ok(!t.$('result').textContent.includes('undefined'));t.dom.window.close();
 console.log('PASS: submitting shows a receipt and locked results, without score values');
 t=await setup('?run='+run+'&mode=review','outside');assert.equal(t.calls.length,0);assert.equal(t.$('openBot').hidden,false);t.dom.window.close();
 console.log('PASS: opening outside Telegram does not request private analysis');
})().catch(e=>{console.error(e);process.exit(1);});
