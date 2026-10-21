const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { validateExtraction, imageMime, boundedBody, downloadScreenshot, readScreenshot, scoreLabel, MAX_IMAGE_BYTES } = require('../src/lib/screenshot-reader');
const { screenshotFile } = require('../src/bot/screenshots');
const { screenshotLines } = require('../src/bot/attendance');

const selected = { exam: 'ielts', section: 'reading' };
const result = { is_result: true, readability: 'clear', exam: 'ielts', section: 'reading', title: 'Reading 1', score_type: 'correct', score: 32, maximum: 40 };
const image = { bytes: Buffer.from([255, 216, 255, 0]), mime: 'image/jpeg' };

test('Screenshot: extracts a visible ratio, preserves zero, and never invents band', () => {
  const r = validateExtraction(result, selected);
  assert.equal(r.percent, 80);
  assert.equal(r.band, undefined);
  assert.equal(scoreLabel(r), '32/40');
  assert.equal(validateExtraction({ ...result, score: 0 }, selected).percent, 0);
});

test('Screenshot: rejects uncertain, missing, forged and out-of-scale scores', () => {
  const cases = [
    { readability: 'uncertain' }, { is_result: false }, { maximum: null }, { score: null },
    { score: '32' }, { score: NaN }, { score: 41 }, { score: -1 }, { maximum: 0 },
    { score: 3.5 }, { maximum: 2000 }, { score_type: 'instructions' },
  ];
  for (const change of cases) assert.throws(() => validateExtraction({ ...result, ...change }, selected));
});

test('Screenshot: IELTS bands and percentage scales have strict denominators', () => {
  const band = { ...result, score_type: 'band', score: 6.5, maximum: null };
  assert.equal(scoreLabel(validateExtraction(band, selected)), '6.5 band');
  assert.throws(() => validateExtraction({ ...band, score: 6.3 }, selected));
  assert.throws(() => validateExtraction({ ...band, maximum: 10 }, selected));
  assert.throws(() => validateExtraction({ ...band, exam: 'cefr' }, { exam: 'cefr', section: 'reading' }));
  const percent = validateExtraction({ ...result, score_type: 'percent', score: 75, maximum: null }, selected);
  assert.equal(scoreLabel(percent), '75%');
  assert.throws(() => validateExtraction({ ...result, score_type: 'percent', maximum: 40 }, selected));
});

test('Screenshot: section mismatch and Writing correct-count are rejected', () => {
  assert.throws(() => validateExtraction(result, { exam: 'cefr', section: 'reading' }));
  assert.throws(() => validateExtraction({ ...result, section: 'writing' }, { exam: 'ielts', section: 'writing' }));
  const r = validateExtraction({ ...result, exam: null, section: null }, selected);
  assert.equal(r.score, 32);
});

test('Screenshot: image bytes checked independently of declared MIME', () => {
  assert.equal(imageMime(image.bytes), 'image/jpeg');
  assert.equal(imageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(imageMime(Buffer.from('RIFFxxxxWEBP')), 'image/webp');
  assert.throws(() => imageMime(Buffer.from('<svg><script>bad</script></svg>')));
  assert.equal(screenshotFile({ photo: [{ file_id: 'small' }, { file_id: 'large' }] }).file_id, 'large');
  assert.equal(screenshotFile({ document: { mime_type: 'application/pdf' } }), null);
});

test('Screenshot: streaming size limit also handles absent content-length', async () => {
  await assert.rejects(boundedBody(new Response('oversized'), 4), e => e.code === 'too_large');
  await assert.rejects(boundedBody(new Response('x', { headers: { 'content-length': '100' } }), 4), e => e.code === 'too_large');
  assert.equal((await boundedBody(new Response('test'), 4)).toString(), 'test');
});

test('Screenshot: Telegram fetch errors never expose the token and reject unsafe paths', async t => {
  const original = config.BOT_TOKEN;
  config.BOT_TOKEN = 'fake-sensitive-token';
  t.after(() => { config.BOT_TOKEN = original; });
  let called = false;
  await assert.rejects(downloadScreenshot({ getFile: async () => ({ file_path: '../private/file.jpg' }) }, { file_id: 'a' }, async () => { called = true; }), e => e.code === 'download');
  assert.equal(called, false);
  await assert.rejects(downloadScreenshot({ getFile: async () => ({ file_path: 'photos/file.jpg' }) }, { file_id: 'a' }, async url => { throw Error(url); }), e => !e.message.includes('fake-sensitive-token'));
  await assert.rejects(downloadScreenshot({}, { file_id: 'a', file_size: MAX_IMAGE_BYTES + 1 }), e => e.code === 'too_large');
});

test('Screenshot: Gemini request uses inline image, schema and a server-side header', async t => {
  const oldKey = config.GEMINI_API_KEY, oldModel = config.GEMINI_SCREENSHOT_MODEL;
  config.GEMINI_API_KEY = 'fake-test-key'; config.GEMINI_SCREENSHOT_MODEL = 'gemini-test';
  t.after(() => { config.GEMINI_API_KEY = oldKey; config.GEMINI_SCREENSHOT_MODEL = oldModel; });
  const got = await readScreenshot(image, selected, async (url, options) => {
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.ok(!url.includes('fake-test-key'));
    assert.equal(options.headers['x-goog-api-key'], 'fake-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
    assert.match(body.systemInstruction.parts[0].text, /untrusted/);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] });
  });
  assert.equal(got.score, 32);
  assert.equal(got.model, 'gemini-test');
});

test('Screenshot: missing key, failed provider, truncation and malformed JSON never create a score', async t => {
  const original = config.GEMINI_API_KEY;
  t.after(() => { config.GEMINI_API_KEY = original; });
  config.GEMINI_API_KEY = '';
  await assert.rejects(readScreenshot(image, selected, () => assert.fail('must not call provider')), e => e.code === 'disabled');
  config.GEMINI_API_KEY = 'fake-test-key';
  await assert.rejects(readScreenshot(image, selected, async () => new Response('sensitive provider body', { status: 429 })), e => e.code === 'service' && !e.message.includes('sensitive'));
  const responses = [
    { candidates: [{ finishReason: 'MAX_TOKENS' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{bad' }] } }] },
  ];
  for (const value of responses) {
    await assert.rejects(readScreenshot(image, selected, async () => Response.json(value)));
  }
});

test('Screenshot: attendance text escapes titles/names and uses account identity', () => {
  const text = screenshotLines([{ ...result, user: 'u1', title: '<b>Injected</b>', accepted_at: '2026-10-20T20:00:00Z' }], [{ _id: 'u1', full_name: 'Ali & Vali' }]);
  assert.match(text, /Ali &amp; Vali/);
  assert.match(text, /&lt;b&gt;Injected&lt;\/b&gt;/);
  assert.match(text, /21\.10\.2026/);
  assert.match(text, /32\/40/);
});
