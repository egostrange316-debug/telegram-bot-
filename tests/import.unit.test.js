const test=require('node:test'),assert=require('node:assert/strict');
const {zipSync,strToU8}=require('fflate');
const {createHmac}=require('crypto');
const {importFile,parseJSON,validatePackage}=require('../src/biology/importer');
const {validateInitData,issueSession,verifySession}=require('../src/biology/auth');
const sample=()=>{const mock={mock_id:'BIO7-TEST',version:1,title:'Format test',grade:7,topics:['50'],question_count:30,questions:Array.from({length:30},(_,i)=>({question_id:`Q${String(i+1).padStart(3,'0')}`,source_topic:'50',source_question_number:i+1,text:`Savol ${i+1}`,options:{A:'A matn',B:'B matn',C:'C matn',D:'D matn'}}))};return {mock,answer_key:{mock_id:mock.mock_id,version:1,answers:Object.fromEntries(mock.questions.map(q=>[q.question_id,'B']))}};};
const pack=d=>zipSync({'mock.json':strToU8(JSON.stringify(d.mock)),'answers.json':strToU8(JSON.stringify(d.answer_key)),'index.html':strToU8('<script>const answer_key="SECRET"</script>')});
test('valid JSON and ZIP import identically and discard untrusted HTML and inline answer fields',()=>{const d=sample();d.mock.questions[0].answer='B';const a=importFile(pack(d),'test.zip'),b=importFile(strToU8(JSON.stringify(d)),'test.json');assert.deepEqual(a,b);assert.equal(a.answer_key.length,30);assert.ok(!JSON.stringify(a.questions).includes('answer'));assert.ok(!JSON.stringify(a).includes('SECRET'));});
test('import rejects duplicate IDs, invalid count/options, missing/extra/wrong keys and mismatched version with a question ID',()=>{
  for(const [edit,pattern] of [[d=>d.mock.questions[1].question_id='Q001',/Q001/],[d=>d.mock.question_count=50,/50/],[d=>delete d.mock.questions[0].options.D,/Q001/],[d=>delete d.answer_key.answers.Q001,/Q001/],[d=>d.answer_key.answers.OTHER='A',/OTHER/],[d=>d.answer_key.answers.Q001='E',/Q001/],[d=>d.answer_key.version=2,/version/],[d=>d.mock.questions[0].question_id='../Q',/ID/]]){const d=sample();edit(d);assert.throws(()=>validatePackage(d.mock,d.answer_key),pattern);}
});
test('duplicate JSON keys, dangerous properties and deep nesting are rejected before parse',()=>{for(const s of ['{"Q001":"A","Q001":"B"}','{"__proto__":{}}','['.repeat(20)+'0'+']'.repeat(20)])assert.throws(()=>parseJSON(s,'test'));});
test('ZIP rejects traversal, symlinks, unexpected files, bombs, corruption and oversized uploads',()=>{
 const d=sample(),base={'mock.json':strToU8(JSON.stringify(d.mock)),'answers.json':strToU8(JSON.stringify(d.answer_key))};
 for(const name of ['../index.html','/index.html','folder/mock.json','evil.js'])assert.throws(()=>importFile(zipSync({...base,[name]:strToU8('x')}),'test.zip'));
 assert.throws(()=>importFile(zipSync({...base,'index.html':strToU8('x'.repeat(1100000))}),'x.zip'),/hajmi/);
 const bad=pack(d);bad[35]^=1;assert.throws(()=>importFile(bad,'x.zip'));
 const link=zipSync({...base,'index.html':[strToU8('mock.json'),{os:3,attrs:0xa1ff0000}]});assert.throws(()=>importFile(link,'x.zip'));
 assert.throws(()=>importFile(new Uint8Array(2100000),'x.json'));
});
const token='123456789:fixture-only',now=1700000000000;
function signed(user={id:123,first_name:'Ali'},stamp=now/1000){const p=new URLSearchParams({auth_date:String(stamp),user:JSON.stringify(user),query_id:'abc'});const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort().map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return p.toString();}
test('Telegram auth verifies signature, signed ID, age and duplicate parameters',()=>{assert.equal(validateInitData(signed(),token,now).id,123);assert.throws(()=>validateInitData(signed().replace('123%2C','999%2C'),token,now));assert.throws(()=>validateInitData(signed()+'&user={}',token,now));assert.throws(()=>validateInitData(signed(undefined,now/1000-301),token,now));assert.throws(()=>validateInitData(signed(undefined,now/1000+100),token,now));assert.throws(()=>validateInitData(signed({id:'123'}),token,now));});
test('server sessions reject tampering, wrong token and expiration',()=>{const session=issueSession({id:123},token,now);assert.equal(verifySession(session,token,now).id,123);assert.throws(()=>verifySession(session+'X',token,now));assert.throws(()=>verifySession(session,'other',now));assert.throws(()=>verifySession(session,token,now+6*3600_000));});
module.exports={sample};
const legacy=(code)=>{const d=sample();return {mock:{mock_id:code,questions:d.mock.questions.map(q=>({id:q.question_id,topic:50,question:q.text,options:q.options}))},key:{mock_id:code,answers:d.answer_key.answers}};};
const zipBundle=(pairs)=>zipSync(Object.fromEntries(pairs.flatMap(([prefix,d])=>[[`${prefix}_mock.json`,strToU8(JSON.stringify(d.mock))],[`${prefix}_answers.json`,strToU8(JSON.stringify(d.key))],[`${prefix}.html`,strToU8('<script>throw Error("untrusted")</script>')]])));
test('original two-MOCK six-file ChatGPT ZIP imports both tests without changing keys',()=>{
 const data=importFile(zipBundle([['BIO7_MOCK_01',legacy('BIO7-50-59-M1')],['BIO7_MOCK_02',legacy('BIO7-50-59-M2')]]),'combined.zip');
 assert.deepEqual(data.packages.map(p=>p.mock_id),['BIO7-50-59-M1','BIO7-50-59-M2']);
 for(const p of data.packages){assert.equal(p.grade,7);assert.equal(p.version,1);assert.equal(p.question_count,30);assert.equal(p.questions[0].text,'Savol 1');assert.equal(p.questions[0].question_id,'Q001');assert.deepEqual(p.answer_key,Array(30).fill('B'));assert.ok(p.import_notes.some(n=>n.includes('Kitob')));assert.ok(!JSON.stringify(p).includes('untrusted'));}
});
test('safe wrapper folders and optional README do not count as extra mocks',()=>{
 const d=sample(),b=zipSync({'wrapper/':new Uint8Array(),'wrapper/mock.json':strToU8(JSON.stringify(d.mock)),'wrapper/answers.json':strToU8(JSON.stringify(d.answer_key)),'wrapper/index.html':strToU8('<script>danger()</script>'),'wrapper/README.md':strToU8('Untrusted README')});
 assert.equal(importFile(b,'wrapper.zip').mock_id,d.mock.mock_id);
});
test('two folder packages with canonical filenames match keys by mock ID and version',()=>{
 const a=sample(),b=sample();b.mock.mock_id='BIO7-SECOND';b.answer_key.mock_id=b.mock.mock_id;b.answer_key.answers.Q001='D';
 const data=importFile(zipSync({'a/mock.json':strToU8(JSON.stringify(a.mock)),'b/answers.json':strToU8(JSON.stringify(a.answer_key)),'b/mock.json':strToU8(JSON.stringify(b.mock)),'a/answers.json':strToU8(JSON.stringify(b.answer_key))}),'two.zip');
 assert.deepEqual(data.packages.map(p=>p.answer_key[0]),['B','D']);
});
test('multi-MOCK archives reject invalid second test, duplicate identities, unmatched and ambiguous keys',()=>{
 const a=legacy('BIO7-A'),b=legacy('BIO7-B');delete b.key.answers.Q010;
 assert.throws(()=>importFile(zipBundle([['first',a],['second',b]]),'x.zip'),/second_mock.json: Q010/);
 assert.throws(()=>importFile(zipBundle([['first',a],['second',a]]),'x.zip'),/takrorlangan/);
 const d=sample();const files={'mock.json':strToU8(JSON.stringify(d.mock)),'answers.json':strToU8(JSON.stringify(d.answer_key))};
 assert.throws(()=>importFile(zipSync({...files,'extra_answers.json':strToU8(JSON.stringify({...d.answer_key,mock_id:'OTHER'}))}),'x.zip'),/tegishli MOCK/);
 assert.throws(()=>importFile(zipSync({...files,'extra_answers.json':strToU8(JSON.stringify(d.answer_key))}),'x.zip'),/takrorlangan/);
});
test('legacy adaptation never guesses missing answers, unknown grades or a newer key version',()=>{
 const a=legacy('BIO7-A');a.mock.version=2;
 assert.throws(()=>importFile(zipBundle([['first',a]]),'x.zip'),/kaliti/);
 const b=legacy('UNKNOWN');assert.throws(()=>importFile(zipBundle([['first',b]]),'x.zip'),/version/);
 const c=legacy('BIO7-C');delete c.key.answers.Q001;assert.throws(()=>importFile(zipBundle([['first',c]]),'x.zip'),/Q001/);
});
test('folder support still rejects traversal, absolute/Windows paths, duplicate names and excessive entries',()=>{
 const d=sample(),base={'mock.json':strToU8(JSON.stringify(d.mock)),'answers.json':strToU8(JSON.stringify(d.answer_key))};
 for(const name of ['folder/../index.html','/folder/index.html','folder\\index.html','C:/index.html','./index.html','folder//index.html'])assert.throws(()=>importFile(zipSync({...base,[name]:strToU8('x')}),'x.zip'),/xavfli/);
 assert.throws(()=>importFile(zipSync({...base,'MOCK.JSON':base['mock.json']}),'x.zip'),/takrorlangan/);
 const dirs=Object.fromEntries(Array.from({length:39},(_,i)=>[`folder${i}/`,new Uint8Array()]));assert.throws(()=>importFile(zipSync({...base,...dirs}),'x.zip'),/eng ko‘pi 40/);
});
