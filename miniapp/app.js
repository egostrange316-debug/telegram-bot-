'use strict';
const API='https://sxcdniihidqfqivfijtn.supabase.co/functions/v1/enzo-bot/api';
const $=id=>document.getElementById(id), tg=window.Telegram?.WebApp;
let token='',user=null,mock=null,attempt=null,choices={},index=0,offset=0,busy=false,expired=false;
let analysis=null,analysisIndex=0;
const display=id=>{for(const x of ['welcome','exam','review','result','analysis'])$(x).hidden=x!==id;window.scrollTo({top:0,behavior:'smooth'});};
const tell=(id,text)=>{$(id).textContent=text;$(id).hidden=!text;};
async function request(action,body={}) {
  const response=await fetch(`${API}/${action}`,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Ulanish xatosi.');return data;
}
const date=s=>new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const cacheKey=()=>`bio:${user.id}:${mock.run_id}:${attempt.nonce}`;
function save(){try{sessionStorage.setItem(cacheKey(),JSON.stringify(choices));}catch{}}
function render() {
  const q=mock.questions[index],count=Object.values(choices).filter(v=>v!=='-').length;
  $('answered').textContent=`${count}/${mock.question_count} ta belgilandi`;$('position').textContent=`${index+1}-savol`;
  $('progress').max=mock.question_count;$('progress').value=count;$('topic').textContent=`MAVZU ${q.source_topic}`;$('question').textContent=q.text;
  $('numbers').replaceChildren();mock.questions.forEach((q,i)=>{const b=document.createElement('button');b.textContent=i+1;b.className=(choices[q.question_id]&&choices[q.question_id]!=='-'?'done ':'')+(i===index?'active':'');b.setAttribute('aria-label',`${i+1}-savol`);if(i===index)b.setAttribute('aria-current','step');b.onclick=()=>{index=i;render();};$('numbers').append(b);});
  $('options').replaceChildren();for(const k of ['A','B','C','D']){const b=document.createElement('button');b.className='option';b.setAttribute('aria-pressed',String(choices[q.question_id]===k));const letter=document.createElement('b');letter.textContent=k;const text=document.createElement('span');text.textContent=q.options[k];b.append(letter,text);b.disabled=expired;b.onclick=()=>{choices[q.question_id]=k;save();render();tg?.HapticFeedback?.selectionChanged();};$('options').append(b);}
  $('prev').disabled=index===0;$('next').disabled=index===mock.question_count-1;$('clear').disabled=expired;
}
function clock(){if(!mock)return;const left=Math.max(0,new Date(mock.ends_at).getTime()-(Date.now()+offset)),seconds=Math.floor(left/1000);$('clock').textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;$('clock').parentElement.classList.toggle('urgent',left<300000);
  if(!left&&!expired){expired=true;$('finish').disabled=true;$('submit').disabled=true;tell('examError','Vaqt tugadi. Yangi javoblar qabul qilinmaydi.');tell('submitError','Vaqt tugadi. Javoblar qabul qilinmaydi.');if(!$('exam').hidden)render();}}
async function start(run_id){try{tell('notice','Savollar yuklanmoqda…');const data=await request('start',{run_id});mock=data.mock;attempt=data.attempt;offset=new Date(data.server_time).getTime()-Date.now();choices={};try{const saved=JSON.parse(sessionStorage.getItem(cacheKey())||'{}');for(const q of mock.questions)if(['A','B','C','D'].includes(saved[q.question_id]))choices[q.question_id]=saved[q.question_id];}catch{}
  $('title').textContent=mock.title;$('mockCode').textContent=`${mock.mock_id} · V${mock.version}`;expired=false;index=0;display('exam');render();clock();tg?.enableClosingConfirmation?.();
}catch(e){tell('notice',e.message);}}
$('prev').onclick=()=>{index--;render();};$('next').onclick=()=>{index++;render();};$('clear').onclick=()=>{delete choices[mock.questions[index].question_id];save();render();};
$('finish').onclick=()=>{clock();if(expired)return;const done=Object.values(choices).filter(v=>v!=='-').length;$('reviewText').textContent=`${mock.question_count} savoldan ${done} tasi belgilangan. ${mock.question_count-done} ta bo‘sh javob xato hisoblanadi.`;display('review');};$('back').onclick=()=>display('exam');
$('submit').onclick=async()=>{if(busy||expired)return;busy=true;$('submit').disabled=true;$('submit').textContent='Topshirilmoqda…';tell('submitError','');try{
  const answers=Object.fromEntries(mock.questions.map(q=>[q.question_id,choices[q.question_id]||'-']));const r=await request('submit',{run_id:mock.run_id,mock_id:mock.mock_id,version:mock.version,nonce:attempt.nonce,answers});
  try{sessionStorage.removeItem(cacheKey());}catch{}tg?.disableClosingConfirmation?.();
  $('analysisAvailable').textContent=`Natija va tahlil ${date(r.results_available_at||mock.ends_at)} (Toshkent) dan keyin ochiladi.`;
  $('resultAnalysis').dataset.reviewAfter=mock.ends_at;$('resultAnalysis').onclick=()=>openAnalysis(mock.run_id);reviewClock();display('result');
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
async function loadList() {
  const data=await request('list');offset=new Date(data.server_time).getTime()-Date.now();$('mockList').replaceChildren();$('historyList').replaceChildren();
  tell('notice',data.mocks.length?'Mocklar Toshkent vaqti bo‘yicha ochiladi.':'Hozir ochiq mock yo‘q.');
  for(const m of data.mocks){const card=document.createElement('article');card.className='mock-card';const h=document.createElement('h2');h.textContent=m.title;const p=document.createElement('p');p.textContent=`${m.question_count} savol · ${date(m.starts_at)} — ${date(m.ends_at)} (Toshkent)`;const b=document.createElement('button');b.className='button';b.textContent=m.status==='open'?'Boshlash':'Hali boshlanmagan';b.disabled=m.status!=='open';b.onclick=()=>start(m.run_id);card.append(h,p,b);$('mockList').append(card);}
  $('historySection').hidden=!(data.history||[]).length;
  for(const m of data.history||[]){const card=document.createElement('article');card.className='mock-card';const h=document.createElement('h2');h.textContent=m.title;const p=document.createElement('p');p.textContent=m.review_ready?`${m.correct}/${m.total} · ${String(m.percent).replace('.',',')}% · Tahlil ochiq`:`Javoblaringiz saqlandi. Natija va tahlil: ${date(m.ends_at)} (Toshkent) dan keyin.`;
    const b=document.createElement('button');b.className='button';b.dataset.reviewAfter=m.ends_at;b.onclick=()=>openAnalysis(m.run_id);card.append(h,p,b);$('historyList').append(card);}
  reviewClock();return data;
}
async function home(){display('welcome');try{await loadList();}catch(e){tell('notice',e.message);}}
$('analysisHome').onclick=home;$('resultHome').onclick=home;
(async()=>{tg?.ready();tg?.expand();if(!tg?.initData){tell('notice','Test va tahlilni Telegram botdagi tugma orqali oching. Shunda akkauntingiz avtomatik tasdiqlanadi.');$('openBot').hidden=false;return;}
try{const session=await request('session',{init_data:tg.initData});token=session.token;user=session.user;$('identity').textContent=user.name;
const params=new URLSearchParams(location.search),run=params.get('run');
if(run&&params.get('mode')==='review'){await openAnalysis(run);return;}
const data=await loadList();if(run){if(data.history?.some(m=>m.run_id===run&&m.review_ready))await openAnalysis(run);else await start(run);}}
catch(e){tell('notice',e.message);$('openBot').hidden=false;}})();setInterval(()=>{clock();reviewClock();},1000);
