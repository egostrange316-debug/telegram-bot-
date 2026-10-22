const { isIP } = require('node:net');

// Render Blueprint references supply host and credentials separately.
// Keep an explicit URI authoritative for Docker Compose and existing installs.
function mongoUri(env = process.env) {
  if (env.MONGO_URI) return env.MONGO_URI;
  if (!env.MONGO_HOST) return undefined;
  let host = env.MONGO_HOST;
  if (isIP(host) === 6) host = `[${host}]`;
  if (!/^[a-zA-Z0-9.-]+$/.test(host) && !(host.startsWith('[') && host.endsWith(']') && isIP(host.slice(1, -1)) === 6)) {
    throw new Error('MONGO_HOST noto‘g‘ri sozlangan');
  }
  const port = env.MONGO_PORT || '27017';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('MONGO_PORT noto‘g‘ri sozlangan');
  if (!env.MONGO_USER || !env.MONGO_PASSWORD) throw new Error('MONGO_USER va MONGO_PASSWORD talab qilinadi');
  const database = env.MONGO_DATABASE || 'enzo_bot';
  const authSource = env.MONGO_AUTH_SOURCE || 'admin';
  return `mongodb://${encodeURIComponent(env.MONGO_USER)}:${encodeURIComponent(env.MONGO_PASSWORD)}@${host}:${port}/${encodeURIComponent(database)}?authSource=${encodeURIComponent(authSource)}`;
}

module.exports = { mongoUri };
