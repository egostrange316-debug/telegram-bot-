const { Inflate } = require('fflate');
const { InputError } = require('./domain');
const MAX_FILE = 2 * 1024 * 1024, MAX_ENTRY = 1024 * 1024;
const fail = message => { throw new InputError(message); };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
function str(x, name, max) {
  if (typeof x !== 'string' || !x.trim() || x.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(x)) fail(`${name}: bo‘sh yoki juda uzun matn.`);
  return x.trim();
}
function id(x, name) {
  if (typeof x !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(x)) fail(`${name}: faqat harf, raqam, - va _ (1–64 belgi).`);
  return x;
}
// Reject duplicate JSON properties (JSON.parse alone silently keeps the last).
function parseJSON(text, name) {
  if (text.length > MAX_ENTRY) fail(`${name}: hajmi 1 MB dan katta.`);
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  const string = () => {
    const start = i++;
    while (i < text.length) { const c = text[i++]; if (c === '\\') i++; else if (c === '"') return JSON.parse(text.slice(start, i)); }
    throw Error();
  };
  function value(depth = 0) {
    if (depth > 12) fail(`${name}: JSON ichma-ichligi juda katta.`);
    ws(); const c = text[i];
    if (c === '"') { string(); return; }
    if (c === '{') {
      i++; ws(); const keys = new Set(); if (text[i] === '}') { i++; return; }
      while (i < text.length) {
        ws(); if (text[i] !== '"') throw Error(); const k = string();
        if (keys.has(k)) fail(`${name}: takrorlangan maydon yoki ID: ${k.slice(0,64)}`);
        if (['__proto__','constructor','prototype'].includes(k)) fail(`${name}: ruxsat etilmagan maydon.`);
        keys.add(k); ws(); if (text[i++] !== ':') throw Error(); value(depth + 1); ws();
        if (text[i] === '}') { i++; return; } if (text[i++] !== ',') throw Error();
      }
      throw Error();
    }
    if (c === '[') {
      i++; ws(); if (text[i] === ']') { i++; return; }
      while (i < text.length) { value(depth + 1); ws(); if (text[i] === ']') { i++; return; } if (text[i++] !== ',') throw Error(); }
      throw Error();
    }
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!m) throw Error(); i += m[0].length;
  }
  try { value(); ws(); if (i !== text.length) throw Error(); return JSON.parse(text); }
  catch (e) { if (e instanceof InputError) throw e; fail(`${name}: JSON sintaksisi noto‘g‘ri.`); }
}
function validatePackage(mock, key) {
  if (!object(mock) || !object(key)) fail('mock va answer_key obyektlari kerak.');
  const mock_id = id(mock.mock_id, 'mock_id');
  if (!Number.isSafeInteger(mock.version) || mock.version < 1 || mock.version > 9999) fail('version: 1–9999 orasidagi butun son.');
  if (key.mock_id !== mock_id || key.version !== mock.version) fail('Javob kalitidagi mock_id/version testga mos emas.');
  if (![30,50].includes(mock.question_count)) fail('question_count: 30 yoki 50 bo‘lsin.');
  if (!Array.isArray(mock.questions) || mock.questions.length !== mock.question_count) fail(`Savollar soni ${mock.question_count} bo‘lishi kerak; topildi: ${mock.questions?.length ?? 0}.`);
  if (!Number.isInteger(mock.grade) || mock.grade < 1 || mock.grade > 12) fail('grade: 1–12 orasidagi sinf raqami.');
  if (!Array.isArray(mock.topics) || !mock.topics.length || mock.topics.length > 50) fail('topics: 1–50 ta mavzu ro‘yxati.');
  if (!object(key.answers)) fail('Kalitda answers obyekti yo‘q.');
  const seen = new Set(), answer_key = [];
  const questions = mock.questions.map((q, i) => {
    if (!object(q)) fail(`${i + 1}-savol: obyekt emas.`);
    const qid = id(q.question_id, `${i + 1}-savol ID`);
    if (seen.has(qid)) fail(`${qid}: takrorlangan savol ID.`); seen.add(qid);
    if (!object(q.options) || Object.keys(q.options).sort().join('') !== 'ABCD') fail(`${qid}: aynan A, B, C, D variantlari bo‘lsin.`);
    if (!Number.isSafeInteger(q.source_question_number) || q.source_question_number < 1) fail(`${qid}: source_question_number musbat butun son bo‘lsin.`);
    const options = Object.fromEntries(['A','B','C','D'].map(k => [k, str(q.options[k], `${qid}.${k}`, 350)]));
    if (!Object.hasOwn(key.answers, qid)) fail(`${qid}: javob kalitda yo‘q.`);
    if (!['A','B','C','D'].includes(key.answers[qid])) fail(`${qid}: kalit A/B/C/D dan biri bo‘lsin.`);
    answer_key.push(key.answers[qid]);
    // Explicit whitelist: never store an inline answer/explanation in public questions.
    return { question_id: qid, source_topic: str(q.source_topic, `${qid}.source_topic`, 120), source_question_number: q.source_question_number,
      text: str(q.text, `${qid}.text`, 1500), options };
  });
  for (const qid of Object.keys(key.answers)) if (!seen.has(qid)) fail(`${qid}: kalitda bor, savollarda yo‘q.`);
  return { mock_id, version: mock.version, title: str(mock.title, 'title', 100), grade: mock.grade,
    topics: mock.topics.map(x => str(x, 'topics', 120)), question_count: mock.question_count, questions, answer_key };
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c >>> 1 ^ (c & 1 ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function unzip(bytes) {
  if (bytes.length > MAX_FILE || bytes.length < 22) fail('ZIP hajmi noto‘g‘ri (eng ko‘pi 2 MB).');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
  const decode = b => new TextDecoder('utf-8', { fatal: true }).decode(b);
  try {
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50) end--;
    if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length) fail('ZIP yakuni buzilgan.');
    const count = u16(end + 10), size = u32(end + 12), offset = u32(end + 16);
    if (u16(end+4) || u16(end+6) || count !== u16(end+8) || count < 2 || count > 3 || offset + size !== end) fail('ZIP: 2–3 ta fayl, oddiy bir qismli arxiv kerak.');
    let p = offset, total = 0; const files = Object.create(null), ranges = [];
    for (let i = 0; i < count; i++) {
      if (u32(p) !== 0x02014b50) fail('ZIP katalogi buzilgan.');
      const flags = u16(p+8), method = u16(p+10), crc = u32(p+16), compressed = u32(p+20), length = u32(p+24);
      const nl = u16(p+28), ex = u16(p+30), comment = u16(p+32), local = u32(p+42), mode = u32(p+38) >>> 16;
      const name = decode(bytes.subarray(p+46, p+46+nl));
      if (!['mock.json','answers.json','index.html'].includes(name) || files[name]) fail(`ZIP: noma’lum/takrorlangan yoki xavfli yo‘l: ${name.slice(0,80)}`);
      if (flags & ~0x808 || ![0,8].includes(method) || (mode & 0xf000) === 0xa000 || u16(p+34)) fail(`${name}: shifrlangan/link yoki qo‘llanmaydigan ZIP formati.`);
      total += length;
      if (length > MAX_ENTRY || total > MAX_FILE || compressed > MAX_FILE) fail(`${name}: ochilgan hajmi limitdan katta.`);
      if (u32(local) !== 0x04034b50 || u16(local+6) !== flags || u16(local+8) !== method) fail(`${name}: ZIP sarlavhasi mos emas.`);
      const lnl = u16(local+26), start = local + 30 + lnl + u16(local+28), stop = start + compressed;
      if (decode(bytes.subarray(local+30,local+30+lnl)) !== name || stop > offset || ranges.some(([a,b]) => local < b && stop > a)) fail(`${name}: ZIP yo‘li yoki chegarasi noto‘g‘ri.`);
      ranges.push([local,stop]);
      let output;
      if (method === 0) output = bytes.slice(start,stop);
      else {
        let written = 0; const chunks = [];
        const stream = new Inflate(chunk => { written += chunk.length; if (written > length || written > MAX_ENTRY) fail(`${name}: ZIP ochish limiti oshdi.`); chunks.push(chunk); });
        // Small input chunks cap even a dishonest DEFLATE bomb's transient allocation.
        for (let pos = start; pos < stop; pos += 256) stream.push(bytes.subarray(pos,Math.min(stop,pos+256)), pos+256 >= stop);
        output = new Uint8Array(written); let at = 0; for (const chunk of chunks) { output.set(chunk,at); at += chunk.length; }
      }
      if (output.length !== length || crc32(output) !== crc) fail(`${name}: ZIP hajmi yoki CRC noto‘g‘ri.`);
      files[name] = decode(output); p += 46 + nl + ex + comment;
    }
    if (p !== end || !files['mock.json'] || !files['answers.json']) fail('ZIP ichida mock.json va answers.json bo‘lishi shart.');
    return files;
  } catch (e) { if (e instanceof InputError) throw e; fail('ZIP buzilgan yoki ochib bo‘lmadi.'); }
}
function importFile(bytes, filename) {
  if (bytes.length > MAX_FILE) fail('Fayl 2 MB dan katta.');
  if (/\.zip$/i.test(filename)) {
    const files = unzip(bytes);
    // index.html is intentionally never executed, served, or persisted. It may contain a key.
    return validatePackage(parseJSON(files['mock.json'],'mock.json'),parseJSON(files['answers.json'],'answers.json'));
  }
  if (!/\.json$/i.test(filename)) fail('Faqat ZIP yoki JSON yuboring.');
  let text; try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { fail('UTF-8 fayl yuboring.'); }
  const data = parseJSON(text,'JSON');
  if (!object(data)) fail('JSON ichida mock va answer_key obyektlari bo‘lsin.');
  return validatePackage(data.mock, data.answer_key);
}
async function boundedBytes(response, limit = MAX_FILE) {
  if (!response.ok || Number(response.headers.get('content-length')) > limit || !response.body) fail('Faylni yuklab bo‘lmadi yoki hajmi katta.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const {value,done} = await reader.read(); if (done) break; size += value.length; if (size > limit) fail('Fayl hajmi limitdan katta.'); chunks.push(value); } }
  finally { await reader.cancel().catch(()=>{}); }
  const bytes = new Uint8Array(size); let at=0; for (const c of chunks) { bytes.set(c,at); at+=c.length; } return bytes;
}
async function downloadImport(api, document, token, fetcher = fetch) {
  if (!document || !/\.(zip|json)$/i.test(document.file_name || '') || document.file_size > MAX_FILE) fail('2 MB gacha ZIP yoki JSON fayl yuboring.');
  const file = await api.getFile(document.file_id);
  if (!file.file_path || !/^[\w./-]+$/.test(file.file_path) || file.file_path.includes('..')) fail('Telegram fayl yo‘li yaroqsiz.');
  let response; try { response = await fetcher(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{signal:AbortSignal.timeout(15000)}); } catch { fail('Faylni yuklashda uzilish. Qayta yuboring.'); }
  return importFile(await boundedBytes(response),document.file_name);
}
module.exports = { importFile, validatePackage, parseJSON, unzip, crc32, boundedBytes, downloadImport, MAX_FILE };
