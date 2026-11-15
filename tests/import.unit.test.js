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
