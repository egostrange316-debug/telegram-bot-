const test = require('node:test');
const assert = require('node:assert/strict');
const { mongoUri } = require('../src/lib/mongo-uri');
const base = { MONGO_HOST: 'enzo-mongo.internal', MONGO_USER: 'enzo', MONGO_PASSWORD: 'test-only' };

test('explicit MongoDB URI stays authoritative and missing configuration stays missing', () => {
  assert.equal(mongoUri({ ...base, MONGO_URI: 'mongodb://localhost/test' }), 'mongodb://localhost/test');
  assert.equal(mongoUri({}), undefined);
});

test('Render generated credentials are escaped and authenticate against admin', () => {
  const uri = mongoUri({ ...base, MONGO_USER: 'test@user', MONGO_PASSWORD: 'a/b+c=d:@?#%' });
  const parsed = new URL(uri);
  assert.equal(decodeURIComponent(parsed.username), 'test@user');
  assert.equal(decodeURIComponent(parsed.password), 'a/b+c=d:@?#%');
  assert.equal(parsed.hostname, base.MONGO_HOST);
  assert.equal(parsed.port, '27017');
  assert.equal(parsed.pathname, '/enzo_bot');
  assert.equal(parsed.searchParams.get('authSource'), 'admin');
});

test('MongoDB connection parts support IPv6 and a separate database', () => {
  const uri = mongoUri({ ...base, MONGO_HOST: '::1', MONGO_PORT: '27018', MONGO_DATABASE: 'classroom', MONGO_AUTH_SOURCE: 'classroom' });
  assert.equal(new URL(uri).host, '[::1]:27018');
  assert.equal(new URL(uri).pathname, '/classroom');
  assert.equal(new URL(uri).searchParams.get('authSource'), 'classroom');
});

test('invalid connection parts fail without disclosing credentials', () => {
  for (const change of [{ MONGO_HOST: 'host/?x=1' }, { MONGO_PORT: '0' }, { MONGO_PORT: '65536' }, { MONGO_PORT: 'abc' }, { MONGO_USER: '' }, { MONGO_PASSWORD: '' }]) {
    assert.throws(() => mongoUri({ ...base, ...change }), error => !error.message.includes(base.MONGO_PASSWORD));
  }
});
