const test = require('node:test');
const assert = require('node:assert/strict');
const { JobLog } = require('../src/models/bot');
const { sendReport } = require('../src/lib/delivery');

function deliveries(t, initial = []) {
  const rows = new Map(initial);
  t.mock.method(JobLog, 'create', async row => {
    if (rows.has(row.key)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    rows.set(row.key, { ...row });
  });
  t.mock.method(JobLog, 'findOneAndUpdate', ({ key }, update) => ({ lean: async () => {
    const row = rows.get(key);
    if (row?.state !== 'failed') return null;
    Object.assign(row, update.$set);
    return row;
  } }));
  t.mock.method(JobLog, 'findOne', ({ key }) => ({ lean: async () => rows.get(key) }));
  t.mock.method(JobLog, 'updateOne', async ({ key }, update) => {
    Object.assign(rows.get(key), update.$set);
    for (const field of Object.keys(update.$unset || {})) delete rows.get(key)[field];
  });
  return rows;
}

const text = `${'a'.repeat(3000)}\n${'b'.repeat(3000)}`;
test('report completes only after all parts are delivered', async t => {
  deliveries(t);
  const sent = [];
  assert.equal(await sendReport({ sendMessage: async (_, part) => sent.push(part) }, 1, text, 'report'), true);
  assert.equal(sent.length, 2);
});

test('partial failure retries only the missing report part', async t => {
  const rows = deliveries(t);
  let calls = 0;
  await assert.rejects(sendReport({ sendMessage: async () => {
    if (++calls === 2) throw new Error('offline');
  } }, 1, text, 'report'), /offline/);
  assert.equal(rows.get('report:part:0').state, 'done');
  assert.equal(rows.get('report:part:1').state, 'failed');
  const sent = [];
  assert.equal(await sendReport({ sendMessage: async (_, part) => sent.push(part) }, 1, text, 'report'), true);
  assert.deepEqual(sent, ['b'.repeat(3000)]);
});

test('another worker sending a part does not complete the report', async t => {
  deliveries(t, [['report:part:0', { state: 'running' }]]);
  let sent = 0;
  assert.equal(await sendReport({ sendMessage: async () => sent++ }, 1, text, 'report'), false);
  assert.equal(sent, 0);
});

test('completed and legacy deliveries allow cleanup without resending', async t => {
  deliveries(t, [['report:part:0', { state: 'done' }], ['report:part:1', {}]]);
  let sent = 0;
  assert.equal(await sendReport({ sendMessage: async () => sent++ }, 1, text, 'report'), true);
  assert.equal(sent, 0);
});
