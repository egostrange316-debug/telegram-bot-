'use strict';
const API='https://sxcdniihidqfqivfijtn.supabase.co/functions/v1/enzo-bot/api';
const $=id=>document.getElementById(id), tg=window.Telegram?.WebApp;
let token='',user=null,mock=null,attempt=null,choices={},index=0,offset=0,busy=false,expired=false;
let analysis=null,analysisIndex=0,listData=null,currentRoom=null,resultsData=null,resultsMode='daily',roomBusy=false;
// Motion is decorative: never delays answers, navigation or server requests.
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const activeMotion=new Set(),motionByElement=new WeakMap();
let pendingRequests=0,roomMotionKey='';
function motion(node,frames,options={}) {
  if(!node?.animate||reducedMotion?.matches||document.hidden||node.closest('[hidden]'))return;
  motionByElement.get(node)?.cancel();
  const animation=node.animate(frames,{duration:320,easing:'cubic-bezier(.2,.75,.25,1)',...options});
  activeMotion.add(animation);motionByElement.set(node,animation);
  animation.onfinish=animation.oncancel=()=>{activeMotion.delete(animation);if(motionByElement.get(node)===animation)motionByElement.delete(node);};
}
function stopMotion(){for(const animation of activeMotion)animation.cancel();activeMotion.clear();}
reducedMotion?.addEventListener?.('change',e=>{if(e.matches)stopMotion();});
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('motion-paused',document.hidden);if(document.hidden)stopMotion();});
function reveal(target,selector){
  [...$(target).querySelectorAll(selector)].slice(0,12).forEach((node,i)=>motion(node,
    [{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{delay:Math.min(i*45,225),fill:'backwards'}));
}
function questionMotion(node,key){
  if(node.dataset.motionKey===key)return;node.dataset.motionKey=key;
  motion(node,[{opacity:.45,transform:'translateX(10px)'},{opacity:1,transform:'translateX(0)'}],{duration:220});
}
const display=id=>{document.body.dataset.page=id;for(const x of ['welcome','resultsPage','arena','exam','review','result','analysis'])$(x).hidden=x!==id;$('bottomNav').hidden=['exam','review'].includes(id);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));window.scrollTo({top:0,behavior:reducedMotion?.matches?'auto':'smooth'});};
const tell=(id,text)=>{$(id).textContent=text;$(id).hidden=!text;};
async function request(action,body={},quiet=false) {
  if(!quiet){pendingRequests++;document.body.classList.add('is-loading');$('refreshMocks').setAttribute('aria-busy','true');}
  try{const response=await fetch(`${API}/${action}`,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Ulanish xatosi.');if(data.server_time)offset=new Date(data.server_time).getTime()-Date.now();return data;
  }finally{if(!quiet&&--pendingRequests===0){document.body.classList.remove('is-loading');$('refreshMocks').removeAttribute('aria-busy');}}
}
const date=s=>s?new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s)):'—';
const cacheKey=()=>`bio:${user.id}:${mock.run_id}:${attempt.nonce}`;
function save(){try{sessionStorage.setItem(cacheKey(),JSON.stringify(choices));}catch{}}
function render() {
  const q=mock.questions[index],count=Object.values(choices).filter(v=>v!=='-').length;
  $('answered').textContent=`${count}/${mock.question_count} ta belgilandi`;$('position').textContent=`${index+1}-savol`;
  $('progress').max=mock.question_count;$('progress').value=count;$('topic').textContent=`MAVZU ${q.source_topic}`;$('question').textContent=q.text;
  $('numbers').replaceChildren();mock.questions.forEach((q,i)=>{const b=document.createElement('button');b.textContent=i+1;b.className=(choices[q.question_id]&&choices[q.question_id]!=='-'?'done ':'')+(i===index?'active':'');b.setAttribute('aria-label',`${i+1}-savol`);if(i===index)b.setAttribute('aria-current','step');b.onclick=()=>{index=i;render();};$('numbers').append(b);});
  $('options').replaceChildren();for(const k of ['A','B','C','D']){const b=document.createElement('button');b.className='option';b.setAttribute('aria-pressed',String(choices[q.question_id]===k));const letter=document.createElement('b');letter.textContent=k;const text=document.createElement('span');text.textContent=q.options[k];b.append(letter,text);b.disabled=expired;b.onclick=()=>{choices[q.question_id]=k;save();render();motion($('options').querySelector('[aria-pressed=true] b'),[{transform:'scale(.7)'},{transform:'scale(1.14)',offset:.65},{transform:'scale(1)'}],{duration:240});tg?.HapticFeedback?.selectionChanged();};$('options').append(b);}
  questionMotion($('options').closest('.question-card'),`${mock.run_id}:${q.question_id}`);
  $('prev').disabled=index===0;$('next').disabled=index===mock.question_count-1;$('clear').disabled=expired;
}
function clock(){if(!mock)return;const left=Math.max(0,new Date(mock.ends_at).getTime()-(Date.now()+offset)),seconds=Math.floor(left/1000);$('clock').textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;$('clock').parentElement.classList.toggle('urgent',left<300000);
  if(!left&&!expired){expired=true;$('finish').disabled=true;$('submit').disabled=true;tell('examError','Vaqt tugadi. Yangi javoblar qabul qilinmaydi.');tell('submitError','Vaqt tugadi. Javoblar qabul qilinmaydi.');if(!$('exam').hidden)render();}}
async function start(run_id){try{tell('notice','Savollar yuklanmoqda…');const data=await request('start',{run_id});mock=data.mock;attempt=data.attempt;offset=new Date(data.server_time).getTime()-Date.now();choices={};try{const saved=JSON.parse(sessionStorage.getItem(cacheKey())||'{}');for(const q of mock.questions)if(['A','B','C','D'].includes(saved[q.question_id]))choices[q.question_id]=saved[q.question_id];}catch{}
  $('finish').disabled=false;$('submit').disabled=false;tell('examError','');tell('submitError','');$('title').textContent=mock.title;$('mockCode').textContent=`${mock.mock_id} · V${mock.version}`;expired=false;index=0;display('exam');render();clock();tg?.enableClosingConfirmation?.();
}catch(e){tell('notice',e.message);tell('arenaError',e.message);}}
$('prev').onclick=()=>{index--;render();};$('next').onclick=()=>{index++;render();};$('clear').onclick=()=>{delete choices[mock.questions[index].question_id];save();render();};
$('finish').onclick=()=>{clock();if(expired)return;const done=Object.values(choices).filter(v=>v!=='-').length;$('reviewText').textContent=`${mock.question_count} savoldan ${done} tasi belgilangan. ${mock.question_count-done} ta bo‘sh javob xato hisoblanadi.`;display('review');};$('back').onclick=()=>display('exam');
$('submit').onclick=async()=>{if(busy||expired)return;busy=true;$('submit').disabled=true;$('submit').textContent='Topshirilmoqda…';tell('submitError','');try{
  const answers=Object.fromEntries(mock.questions.map(q=>[q.question_id,choices[q.question_id]||'-']));const r=await request('submit',{run_id:mock.run_id,mock_id:mock.mock_id,version:mock.version,nonce:attempt.nonce,answers});
  try{sessionStorage.removeItem(cacheKey());}catch{}tg?.disableClosingConfirmation?.();
  $('analysisAvailable').textContent=`Natija va tahlil ${date(r.results_available_at||mock.ends_at)} (Toshkent) dan keyin ochiladi.`;
  $('resultAnalysis').dataset.reviewAfter=r.results_available_at||mock.available_at||mock.ends_at;$('roomAfterSubmit').hidden=!r.room_id;$('roomAfterSubmit').onclick=()=>openRoom(r.room_id);$('resultAnalysis').onclick=()=>openAnalysis(mock.run_id);reviewClock();display('result');
}catch(e){tell('submitError',e.message+' Javoblar shu oynada saqlangan.');}finally{busy=false;$('submit').disabled=expired;$('submit').textContent='Tasdiqlash va topshirish';}};
function reviewClock() {
  for (const b of document.querySelectorAll('button[data-review-after]')) {
    b.disabled=Date.now()+offset<new Date(b.dataset.reviewAfter).getTime();
    b.textContent=b.disabled?'Tahlil vaqt tugagach ochiladi':'🔍 Test tahlili';
  }
}
function renderAnalysis() {
  const rows=analysis.questions.filter(q=>!$('errorsOnly').checked||!q.is_correct);
  analysisIndex=Math.max(0,Math.min(analysisIndex,rows.length-1));
  $('analysisEmpty').hidden=rows.length!==0;$('analysisCard').hidden=!rows.length;
  $('analysisPrev').disabled=analysisIndex===0||!rows.length;$('analysisNext').disabled=analysisIndex>=rows.length-1;
  $('analysisNumbers').replaceChildren();
  rows.forEach((q,i)=>{const b=document.createElement('button');b.textContent=q.number;
    b.className=(q.is_correct?'correct':'incorrect')+(i===analysisIndex?' active':'');
    b.setAttribute('aria-label',`${q.number}-savol: ${q.is_correct?'to‘g‘ri':q.selected_answer==='-'?'bo‘sh':'xato'}`);
    if(i===analysisIndex)b.setAttribute('aria-current','step');b.onclick=()=>{analysisIndex=i;renderAnalysis();};$('analysisNumbers').append(b);});
  if(!rows.length)return;
  const q=rows[analysisIndex];$('analysisPosition').textContent=`${q.number}-savol / ${analysis.mock.question_count}`;
  $('analysisStatus').textContent=q.is_correct?'✓ To‘g‘ri':q.selected_answer==='-'?'— Bo‘sh javob':'✕ Xato';
  $('analysisStatus').className=`answer-status ${q.is_correct?'correct':'incorrect'}`;
  $('analysisTopic').textContent=q.source_topic?`MAVZU ${q.source_topic}`:'';$('analysisQuestion').textContent=q.text;
  $('analysisOptions').replaceChildren();
  for(const k of ['A','B','C','D']){
    const row=document.createElement('div');row.className='analysis-option'+(k===q.correct_answer?' correct':k===q.selected_answer?' incorrect':'');
    const letter=document.createElement('b');letter.textContent=k;const text=document.createElement('span');text.textContent=q.options?.[k]||'';
    const label=document.createElement('small');label.textContent=k===q.correct_answer?(k===q.selected_answer?'✓ Sizning javobingiz · To‘g‘ri':'✓ To‘g‘ri javob'):k===q.selected_answer?'✕ Sizning javobingiz':'';
    const body=document.createElement('div');body.append(text,label);row.append(letter,body);$('analysisOptions').append(row);
  }
  questionMotion($('analysisCard'),`${analysis.mock.run_id}:${q.question_id}`);
  $('analysisAnswer').textContent=`Sizning javobingiz: ${q.selected_answer==='-'?'belgilanmagan':q.selected_answer}. To‘g‘ri javob: ${q.correct_answer}.`;
}
async function openAnalysis(run_id) {
  analysis=null;analysisIndex=0;$('errorsOnly').checked=false;$('analysisContent').hidden=true;
  $('analysisTitle').textContent='Test tahlili';$('analysisSummary').textContent='Saqlangan javoblar yuklanmoqda…';tell('analysisError','');display('analysis');
  try{const data=await request('review',{run_id});analysis=data;offset=new Date(data.server_time).getTime()-Date.now();
    $('analysisTitle').textContent=data.mock.title;$('analysisSummary').textContent=`${data.result.correct}/${data.result.total} to‘g‘ri · ${String(data.result.percent).replace('.',',')}% · ${data.result.total-data.result.correct} ta xato yoki bo‘sh`;
    $('analysisContent').hidden=false;tg?.disableClosingConfirmation?.();renderAnalysis();
  }catch(e){$('analysisSummary').textContent='';tell('analysisError',e.message);}
}
$('errorsOnly').onchange=()=>{analysisIndex=0;renderAnalysis();};
$('analysisPrev').onclick=()=>{analysisIndex--;renderAnalysis();};$('analysisNext').onclick=()=>{analysisIndex++;renderAnalysis();};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
const localDay=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
const localClock=s=>s?new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'}).format(new Date(s)):'—';
const empty=(target,text)=>$(target).append(el('p',text,'empty-state'));
function renderMocks(){
  $('mockList').replaceChildren();const query=$('mockSearch').value.toLowerCase().trim();
  const rows=(listData?.mocks||[]).filter(m=>`${m.title} ${(m.topics||[]).join(' ')}`.toLowerCase().includes(query));$('mockCount').textContent=rows.length;
  rows.forEach((m,i)=>{const card=el('article',undefined,'mock-card'),top=el('div',undefined,'card-top');top.append(el('span','✳','paper-mark'),el('span',m.is_open||m.status==='open'?'● Ochiq':'◷ 07:00 da ochiladi','pill'));
    const h=el('h2',m.title),p=el('p',(m.topics||[]).join(' · ')||'Biologiya');const foot=el('div',undefined,'card-footer'),b=el('button','Boshlash','button');
    b.disabled=!(m.is_open||m.status==='open');b.onclick=()=>start(m.run_id);foot.append(el('small',`${m.question_count} savol · A / B / C / D`),b);card.append(top,h,p,foot);$('mockList').append(card);});
  reveal('mockList','.mock-card');
  if(!rows.length)empty('mockList',query?'Bu nom yoki mavzuda MOCK topilmadi.':'Hozircha ishlanmagan MOCK yo‘q. Yangi testlar shu yerda ko‘rinadi.');
}
function renderHistory(){
  $('historyList').replaceChildren();const history=listData?.history||[];$('historySection').hidden=!history.length;
  let previous='';for(const m of history){const day=m.submitted_at?localDay(m.submitted_at):'';if(day&&day!==previous){$('historyList').append(el('div',day,'date-divider'));previous=day;}
    const row=el('article',undefined,'history-row'),body=el('div'),b=el('button',undefined,'button');body.append(el('h3',m.title),el('p',m.review_ready?`${localClock(m.submitted_at)} · ${m.correct}/${m.total} · ${String(m.percent).replace('.',',')}%`:`${localClock(m.submitted_at)} · Saqlandi. Natija ${date(m.available_at||m.ends_at)} da.`));
    b.dataset.reviewAfter=m.available_at||m.ends_at;b.onclick=()=>openAnalysis(m.run_id);row.append(body,b);$('historyList').append(row);
  }reveal('historyList','.history-row');reviewClock();
}
function populateGroups(id,groups,all=false){const select=$(id),previous=select.value;select.replaceChildren();if(all){const o=el('option','Barcha guruhlarim');o.value='';select.append(o);}for(const g of groups){const o=el('option',g.title);o.value=g.id;select.append(o);}if([...select.options].some(o=>o.value===previous))select.value=previous;}
async function loadList(){
  const data=await request('list');listData=data;renderMocks();renderHistory();populateGroups('roomGroup',data.groups||[]);populateGroups('resultGroup',data.groups||[],true);
  tell('notice','07:00–22:00 ishlang · Natija va tahlil 22:10 da ochiladi.');renderRecentRooms();return data;
}
async function home(){display('welcome');try{await loadList();}catch(e){tell('notice',e.message);}}
$('analysisHome').onclick=home;$('resultHome').onclick=home;$('refreshMocks').onclick=home;$('mockSearch').oninput=renderMocks;
function resultRow(r){const row=el('article',undefined,'result-row'),body=el('div'),score=el('div',`${r.correct}/${r.total}`,'score');
  body.append(el('h3',r.name+(r.is_me?' · Siz':'')),el('p',r.title),el('time',`Topshirildi ${localClock(r.submitted_at)}${r.started_at?' · boshlandi '+localClock(r.started_at):''}${r.kind==='room'?' · Musobaqa':''}`));
  score.append(el('small',`${String(r.percent).replace('.',',')}%`));row.append(el('span',(r.name||'?').slice(0,1).toUpperCase(),'result-avatar'),body,score);return row;
}
function renderResults(){
  $('resultFeed').replaceChildren();const selected=$('resultDate').value,group=$('resultGroup').value;
  const rows=(resultsData?.results||[]).filter(r=>(!group||r.group_id===group));
  if(resultsMode==='weekly'){
    const today=localDay(Date.now()+offset),end=new Date(today+'T00:00:00+05:00');const local=new Date(end.getTime()+5*3600_000);end.setTime(end.getTime()-((local.getUTCDay()+6)%7)*86400_000);const start=new Date(end.getTime()-7*86400_000);
    const eligible=rows.filter(r=>new Date(r.submitted_at)>=start&&new Date(r.submitted_at)<end);const sums=new Map();
    for(const r of eligible){const key=r.student_id||r.name,v=sums.get(key)||{...r,correct:0,total:0,tests:0};v.correct+=r.correct;v.total+=r.total;v.tests++;sums.set(key,v);}
    $('resultFeed').append(el('div',`${localDay(start)} — ${localDay(new Date(end-1))}`,'date-divider'));
    const sorted=[...sums.values()];
    sorted.forEach(r=>{const row=el('article',undefined,'result-row'),body=el('div');body.append(el('h3','Haftalik natijangiz'),el('p',`${r.tests} ta MOCK · Haftalik jami`));row.append(el('span','✓','result-avatar'),body,el('strong',`${r.correct}/${r.total}`,'score'));$('resultFeed').append(row);});
    reveal('resultFeed','.result-row');
    if(!sorted.length)empty('resultFeed','O‘tgan hafta uchun yakunlangan natija yo‘q. Joriy hafta yakuni keyingi dushanba ochiladi.');return;
  }
  const visible=rows.filter(r=>!selected||localDay(r.submitted_at)===selected);let previous='';
  for(const r of visible){const day=localDay(r.submitted_at);if(day!==previous){$('resultFeed').append(el('div',day,'date-divider'));previous=day;}$('resultFeed').append(resultRow(r));}
  reveal('resultFeed','.result-row');
  if(!visible.length)empty('resultFeed','Bu sana uchun ochilgan natija yo‘q. Bugungi natijalar 22:10 da chiqadi.');
}
async function loadResults(){display('resultsPage');tell('resultsError','');try{resultsData=await request('results');populateGroups('resultGroup',resultsData.groups||[],true);
  if(!$('resultDate').value)$('resultDate').value=resultsData.results[0]?.submitted_at?localDay(resultsData.results[0].submitted_at):localDay(Date.now()+offset);renderResults();
}catch(e){tell('resultsError',e.message);}}
$('resultDate').onchange=renderResults;$('resultGroup').onchange=renderResults;
$('dailyResults').onclick=()=>{resultsMode='daily';$('dailyResults').classList.add('selected');$('weeklyResults').classList.remove('selected');$('resultDate').disabled=false;renderResults();};
$('weeklyResults').onclick=()=>{resultsMode='weekly';$('weeklyResults').classList.add('selected');$('dailyResults').classList.remove('selected');$('resultDate').disabled=true;renderResults();};
function renderRecentRooms(){const target=$('recentRooms');target.replaceChildren();const rows=listData?.rooms||[];if(rows.length)target.append(el('h2','Xonalarim'));for(const r of rows){const b=el('button',`${r.code} · ${r.title||'Yangi xona'}`,'secondary wide');b.onclick=()=>openRoom(r.id);target.append(b);}}
async function arenaHome(){currentRoom=null;display('arena');$('arenaLobby').hidden=false;$('roomPanel').hidden=true;tell('arenaError','');try{await loadList();}catch(e){tell('arenaError',e.message);}}
async function roomAction(action,body){if(roomBusy)return;roomBusy=true;tell('arenaError','');for(const id of ['createRoom','joinRoom','startRoom'])$(id).disabled=true;
  try{const data=await request('room-'+action,body);if(data.room.left){await arenaHome();return;}currentRoom=data.room;renderRoom();}catch(e){tell('arenaError',e.message);}finally{roomBusy=false;for(const id of ['createRoom','joinRoom'])$(id).disabled=false;if(currentRoom)renderRoom();}}
async function openRoom(id){display('arena');tell('arenaError','');try{const data=await request('room-state',{room_id:id});currentRoom=data.room;renderRoom();}catch(e){tell('arenaError',e.message);}}
function renderRoom(){
  const r=currentRoom;if(!r)return;$('arenaLobby').hidden=true;$('roomPanel').hidden=false;$('roomCode').textContent=r.code;$('roomMembers').replaceChildren();
  for(const m of r.members){const card=el('div',undefined,'member-card');card.append(el('span',(m.name||'?').slice(0,1).toUpperCase(),'result-avatar'),el('strong',m.name+(m.is_me?' · Siz':'')),el('small',m.submitted?'✓ Topshirdi':r.state==='active'?'Ishlamoqda…':'Tayyor'));$('roomMembers').append(card);}
  for(let i=r.members.length;i<r.capacity;i++){const card=el('div',undefined,'member-card');card.append(el('span','+','result-avatar'),el('small','Kutilmoqda'));$('roomMembers').append(card);}
  const submitted=r.members.filter(m=>m.submitted).length;
  $('roomStatus').textContent=r.state==='waiting'?`${r.members.length}/${r.capacity} qatnashchi. Kodni do‘stingizga yuboring. Xona 30 daqiqa kutadi.`:r.state==='active'?`${r.title} · ${submitted}/${r.capacity} topshirdi. Tugash: ${localClock(r.ends_at)}. G‘olib hamma topshirgach chiqadi.`:r.state==='finished'?'Musobaqa yakunlandi. Barcha qatnashchilar topshirdi.':r.state==='expired'?'Vaqt tugadi. Hamma topshirmagani uchun g‘olib aniqlanmadi.':'Xona bekor qilingan.';
  $('roomPaperPicker').hidden=!(r.state==='waiting'&&r.is_host);const choice=$('roomPaper').value;$('roomPaper').replaceChildren();
  for(const m of r.mocks||[]){const o=el('option',`${m.title} · ${m.question_count} savol`);o.value=m.run_id;$('roomPaper').append(o);}if([...$('roomPaper').options].some(o=>o.value===choice))$('roomPaper').value=choice;
  $('startRoom').disabled=roomBusy||r.members.length!==r.capacity||!r.mocks?.length;
  if(r.state==='waiting'&&r.is_host&&!r.mocks?.length)$('roomStatus').textContent+=' Hamma uchun ishlanmagan umumiy MOCK topilmadi.';
  $('enterRoomExam').hidden=r.state!=='active'||Boolean(r.members.find(m=>m.is_me)?.submitted);$('enterRoomExam').onclick=()=>start(r.run_id);
  $('leaveRoom').hidden=r.state!=='waiting';$('leaveRoom').textContent=r.is_host?'Xonani bekor qilish':'Xonadan chiqish';$('roomScores').replaceChildren();
  if(r.scores){const banner=el('div',undefined,'winner-banner'),names=r.scores.filter(s=>r.winners.includes(s.id)).map(s=>s.name).join(', ');banner.append(el('strong',r.winners.length>1?'🤝 Durang!':'🏆 '+names),el('p',r.winners.length>1?names+' — teng ball.':'Bugungi bellashuv g‘olibi.'));$('roomScores').append(banner);
    for(const x of r.scores){const row=el('div',undefined,'result-row');row.append(el('span',r.winners.includes(x.id)?'★':'✓','result-avatar'),el('strong',x.name),el('span',`${x.correct}/${x.total}`,'score'));$('roomScores').append(row);}
    $('roomScores').append(el('p','To‘g‘ri javoblar va to‘liq tahlil 22:10 da ochiladi.','save-note'));
  }
  // Polling the same room must not replay entrances every five seconds.
  const motionKey=JSON.stringify([r.id,r.state,r.members,r.scores]);
  if(motionKey!==roomMotionKey){
    reveal('roomMembers','.member-card');reveal('roomScores','.result-row');
    motion($('roomScores').querySelector('.winner-banner'),[{opacity:0,transform:'scale(.95)'},{opacity:1,transform:'scale(1)'}],{duration:420});
    roomMotionKey=motionKey;
  }
}
$('createRoom').onclick=()=>roomAction('create',{group_id:$('roomGroup').value,capacity:Number($('roomCapacity').value)});
$('joinRoom').onclick=()=>{const code=$('roomCodeInput').value.trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(code)){tell('arenaError','8 belgili xona kodini kiriting.');return;}roomAction('join',{code});};
$('startRoom').onclick=()=>roomAction('start',{room_id:currentRoom.id,run_id:$('roomPaper').value});$('leaveRoom').onclick=()=>roomAction('leave',{room_id:currentRoom.id});$('arenaHome').onclick=arenaHome;
$('copyRoom').onclick=async()=>{try{await navigator.clipboard.writeText(currentRoom.code);$('copyRoom').textContent='Nusxalandi ✓';}catch{tell('arenaError','Xona kodi: '+currentRoom.code);}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(!token){tell('notice','Telegram bot orqali kiring.');return;}if(b.dataset.tab==='welcome')home();else if(b.dataset.tab==='resultsPage')loadResults();else arenaHome();});
(async()=>{tg?.ready();tg?.expand();tg?.setHeaderColor?.('#0b100f');tg?.setBackgroundColor?.('#0b100f');if(!tg?.initData){tell('notice','Test, natija va musobaqalarni Telegram bot orqali oching. Akkauntingiz avtomatik tasdiqlanadi.');$('openBot').hidden=false;return;}
try{const session=await request('session',{init_data:tg.initData});token=session.token;user=session.user;$('identity').textContent=user.name;
 const params=new URLSearchParams(location.search),run=params.get('run');
 if(run&&params.get('mode')==='review'){await openAnalysis(run);return;}
 const data=await loadList();if(params.get('tab')==='results'){await loadResults();return;}if(params.get('tab')==='arena'){await arenaHome();return;}
 if(run){if(data.history?.some(m=>m.run_id===run&&m.review_ready))await openAnalysis(run);else await start(run);}
}catch(e){tell('notice',e.message);$('openBot').hidden=false;}})();
setInterval(()=>{clock();reviewClock();},1000);
setInterval(async()=>{if(currentRoom&&!$('arena').hidden&&!roomBusy&&['waiting','active'].includes(currentRoom.state)){
 try{const data=await request('room-state',{room_id:currentRoom.id},true);if(currentRoom?.id===data.room.id){currentRoom=data.room;renderRoom();}}catch(e){tell('arenaError',e.message);}
}},5000);
