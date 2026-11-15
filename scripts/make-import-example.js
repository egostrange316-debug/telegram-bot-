// Public format-only sample. Replace every placeholder before a real exam.
const fs=require('node:fs'),path=require('node:path'),{zipSync,strToU8}=require('fflate');
const dir=path.join(__dirname,'../examples/mock-30');fs.mkdirSync(dir,{recursive:true});
const mock={mock_id:'BIO7-FORMAT-DEMO',title:'FORMAT NAMUNASI — haqiqiy test emas',grade:7,topics:['50–59'],question_count:30,version:1,questions:Array.from({length:30},(_,i)=>({question_id:`Q${String(i+1).padStart(3,'0')}`,source_topic:'50',source_question_number:i+1,text:`${i+1}-savol matnini shu yerga yozing. Bu format namunasi.`,options:{A:'A variant matni',B:'B variant matni',C:'C variant matni',D:'D variant matni'}}))};
const key={mock_id:mock.mock_id,version:1,answers:Object.fromEntries(mock.questions.map((q,i)=>[q.question_id,'ABCD'[i%4]]))};
const encode=x=>JSON.stringify(x,null,2)+'\n';
fs.writeFileSync(path.join(dir,'mock.json'),encode(mock));fs.writeFileSync(path.join(dir,'answers.json'),encode(key));
fs.writeFileSync(path.join(dir,'import.json'),encode({mock,answer_key:key}));
// Deterministic ZIP makes it reproducible and safe to mirror through Git blobs.
const options={mtime:new Date('2026-01-01T00:00:00Z')};
fs.writeFileSync(path.join(dir,'mock-30.zip'),zipSync({'mock.json':[strToU8(encode(mock)),options],'answers.json':[strToU8(encode(key)),options]}));
console.log('30-question JSON and ZIP format examples created');
