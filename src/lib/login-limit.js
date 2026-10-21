// One process is required for long polling. Expired windows are pruned to bound memory.
const windows = new Map();
function allowLogin(telegramId, name, now = Date.now()) {
  for (const [key, value] of windows) if (value.until <= now) windows.delete(key);
  const keys = [`tg:${telegramId}`, `name:${name}`];
  if (keys.some((key) => (windows.get(key)?.count || 0) >= 5)) return false;
  if (windows.size > 10_000) return false;
  for (const key of keys) {
    const value = windows.get(key) || { count: 0, until: now + 15 * 60_000 };
    value.count += 1;
    windows.set(key, value);
  }
  return true;
}
module.exports = { allowLogin };
