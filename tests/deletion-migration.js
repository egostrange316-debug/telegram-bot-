const assert = require('node:assert/strict');

// Exercise the upgrade from legacy soft deletion, including two deleted papers
// in one group: cache invalidation must not trip the new live-package guard.
module.exports = async (db, sql) => {
  const ids = ['aa0000000000000000000001', 'bb0000000000000000000001', 'cc0000000000000000000001'];
  const key = (id, kind) => id.slice(0, 23) + ({ run: '2', result: '3', attempt: '4' }[kind]);
  for (const [i, id] of ids.entries()) {
    const rows = [
      ['bio_packages', id, { status: i < 2 ? 'deleted' : 'approved', mock_id: id, version: 1, answer_key: ['A'], questions: [{ text: 'fixture' }] }],
      ['bio_mocks', key(id, 'run'), { package_id: id, code: id, group_id: 'dd0000000000000000000001', status: i === 1 ? 'scheduled' : 'closed', answer_key: ['A'], daily_text: 'stale' }],
      ['bio_submissions', key(id, 'result'), { mock_id: key(id, 'run'), telegram_id: 991900001, correct: i < 2 ? 0 : 29, total: 30 }],
      ['bio_attempts', key(id, 'attempt'), { mock_id: key(id, 'run'), telegram_id: 991900001, draft: { Q001: 'A' } }],
    ];
    for (const [collection, key, data] of rows) await db.query('insert into public.enzo_documents_store(collection,id,data) values($1,$2,$3)', [collection, key, JSON.stringify(data)]);
  }
  await db.exec(sql);
  const { rows } = await db.query('select collection,id,data from public.enzo_documents_store');
  for (const id of ids.slice(0, 2)) {
    const related = rows.filter(r => r.id.startsWith(id.slice(0, 23)));
    assert.equal(related.length, 2);
    assert.ok(related.every(r => r.data.status === 'deleted' && !r.data.answer_key && !r.data.questions && !r.data.daily_text));
  }
  assert.equal(rows.find(r => r.id === key(ids[2], 'result')).data.correct, 29);
  assert.equal(rows.find(r => r.id === key(ids[2], 'run')).data.status, 'closed');
  await db.exec('set role service_role');
  const result = await db.query("select public.bio_delete_package('not-a-package') as result");
  assert.equal(result.rows[0].result.reason, 'missing');
  await db.exec('reset role');
  await db.query("delete from public.enzo_documents_store where id = any($1::text[])", [ids.flatMap(id => [id, key(id, 'run'), key(id, 'result'), key(id, 'attempt')])]);
  console.log('Deletion migration: legacy backfill and service-role access PASS');
};
