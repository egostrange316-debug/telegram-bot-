const { createHmac, timingSafeEqual, randomBytes } = require('crypto');
class AuthError extends Error {}
const mac = (key, data) => createHmac('sha256', key).update(data).digest();
function check(a, b) { return a.length === b.length && timingSafeEqual(a,b); }
function validateInitData(raw, token, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 8192 || !token) throw new AuthError('Telegram orqali qayta oching.');
  const params = new URLSearchParams(raw), seen = new Set();
  for (const [k] of params) { if (seen.has(k)) throw new AuthError('Takrorlangan autentifikatsiya maydoni.'); seen.add(k); }
  const hash = params.get('hash'); params.delete('hash');
  if (!/^[a-f0-9]{64}$/.test(hash || '')) throw new AuthError('Telegram imzosi yo‘q.');
  const data = [...params].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v])=>`${k}=${v}`).join('\n');
  if (!check(mac(mac('WebAppData',token),data),Buffer.from(hash,'hex'))) throw new AuthError('Telegram imzosi noto‘g‘ri.');
  const date = Number(params.get('auth_date')), seconds = Math.floor(now/1000);
  if (!Number.isInteger(date) || date > seconds + 30 || date < seconds - 300) throw new AuthError('Kirish muddati eskirgan. Botdan qayta oching.');
  let user; try { user = JSON.parse(params.get('user')); } catch { throw new AuthError('Telegram foydalanuvchisi topilmadi.'); }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || user.is_bot) throw new AuthError('Telegram foydalanuvchisi yaroqsiz.');
  return { id:user.id, first_name:String(user.first_name || '').slice(0,100), last_name:String(user.last_name || '').slice(0,100) };
}
function issueSession(user, token, now=Date.now()) {
  const body = Buffer.from(JSON.stringify({aud:'biology-miniapp',user,exp:Math.floor(now/1000)+5*3600,nonce:randomBytes(16).toString('hex')})).toString('base64url');
  return `${body}.${mac(mac(token,'biology-miniapp-session-v1'),body).toString('base64url')}`;
}
function verifySession(value, token, now=Date.now()) {
  if (typeof value !== 'string' || value.length > 2048) throw new AuthError('Kirish talab etiladi.');
  const [body,sig,...extra] = value.split('.');
  if (!body || !sig || extra.length || !check(mac(mac(token,'biology-miniapp-session-v1'),body),Buffer.from(sig,'base64url'))) throw new AuthError('Kirish imzosi noto‘g‘ri.');
  let data; try { data=JSON.parse(Buffer.from(body,'base64url').toString()); } catch { throw new AuthError('Kirish xatosi.'); }
  if (data.aud!=='biology-miniapp' || !Number.isInteger(data.exp) || data.exp<=Math.floor(now/1000) || !Number.isSafeInteger(data.user?.id) || data.user.id<=0) throw new AuthError('Kirish muddati tugagan. Botdan qayta oching.');
  return data.user;
}
module.exports={validateInitData,issueSession,verifySession,AuthError};
