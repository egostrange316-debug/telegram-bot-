/**
 * Ilova (frontend) uchun tayyor komponent: IELTS/CEFR natijalari, o'sish grafigi va o'quv markaz reytingi.
 * Ma'lumot bot API'sidan olinadi; ilovaning o'z tokeni ishlatiladi (bot .env da JWT_SECRET ilova bilan bir xil).
 *
 *   <ExamResultsPanel apiBase="https://bot.example.uz" token={localStorage.getItem('token')} />
 *
 * Kutubxonasiz (grafik — oddiy SVG), istalgan React loyihaga ko'chirib qo'yiladi.
 */
import { useEffect, useState } from 'react';

const SECTIONS = { reading: 'Reading', listening: 'Listening', writing: 'Writing' };
const COLORS = { reading: '#2a78d6', listening: '#e07b39', writing: '#3a9d5d' };
const TREND = { up: "📈 O'syapsiz", down: '📉 Pasayyapsiz', flat: '➡️ Barqaror' };

function LineChart({ items, exam }) {
  const W = 600, H = 220, P = 28;
  const max = exam === 'ielts' ? 9 : 100;
  const val = (it) => (exam === 'ielts' ? it.band ?? 0 : it.percent);
  const x = (i) => P + (items.length < 2 ? 0 : (i * (W - 2 * P)) / (items.length - 1));
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Natijalar grafigi">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={P} x2={W - P} y1={y(f * max)} y2={y(f * max)} stroke="currentColor" strokeOpacity="0.12" />
          <text x={4} y={y(f * max) + 4} fontSize="10" fill="currentColor" opacity="0.6">{exam === 'ielts' ? f * max : `${f * max}%`}</text>
        </g>
      ))}
      {Object.keys(SECTIONS).map((s) => {
        const pts = items.map((it, i) => (it.section === s ? [x(i), y(val(it))] : null)).filter(Boolean);
        if (!pts.length) return null;
        return (
          <g key={s}>
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={COLORS[s]} strokeWidth="2.5" />
            {pts.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="3.5" fill={COLORS[s]} />)}
          </g>
        );
      })}
    </svg>
  );
}

export default function ExamResultsPanel({ apiBase, token }) {
  const [exam, setExam] = useState('ielts');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [revision, refresh] = useState(0);
  const [linkUrl, setLinkUrl] = useState('');
  const [linking, setLinking] = useState(false);
  const base = apiBase.replace(/\/$/, '');
  async function connectTelegram() {
    setLinking(true);
    setError(null);
    try {
      const response = await fetch(`${base}/api/telegram/link`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Botga ulanish havolasi olinmadi');
      const body = await response.json();
      setLinkUrl(body.url);
    } catch (e) { setError(e.message); }
    finally { setLinking(false); }
  }
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) refresh(v => v + 1); }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { setLinkUrl(''); }, [token, apiBase]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setData(null);
    setError(null);
    const get = (p) => fetch(`${base}${p}`, { signal: controller.signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    Promise.all([get(`/api/exams/results?exam=${exam}`), get(`/api/exams/leaderboard?exam=${exam}`)])
      .then(([results, board]) => alive && setData({ results, board }))
      .catch(() => alive && setError("Natijalar yuklanmadi"));
    return () => { alive = false; controller.abort(); };
  }, [base, token, exam, revision]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['ielts', 'cefr'].map((e) => (
          <button key={e} onClick={() => setExam(e)} style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: exam === e ? 700 : 400 }}>
            {e.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
        <button onClick={() => refresh(v => v + 1)}>↻ Yangilash</button>
        <button disabled={linking} onClick={connectTelegram}>{linking ? 'Tayyorlanmoqda…' : 'Telegramga ulash'}</button>
        {linkUrl && <a href={linkUrl} target="_blank" rel="noopener noreferrer">Botni ochish (5 daqiqa)</a>}
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Yuklanmoqda…</p>}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.keys(SECTIONS).map((s) => {
              const v = data.results.sections[s];
              return (
                <div key={s} style={{ padding: 10, borderRadius: 12, background: 'rgba(127,127,127,.1)' }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{SECTIONS[s]}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{v.count ? (exam === 'ielts' ? v.average_band : `${v.average_percent}%`) : '—'}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{v.count} test · {TREND[v.trend.direction] || '—'}</div>
                </div>
              );
            })}
          </div>
          {data.results.trend.direction && <p style={{ fontWeight: 600 }}>{TREND[data.results.trend.direction]} ({data.results.trend.diff > 0 ? '+' : ''}{data.results.trend.diff}%)</p>}
          {data.results.items.length > 0 ? <LineChart items={data.results.items} exam={exam} /> : <p>Hali natija yo'q.</p>}
          <p style={{fontSize:12,opacity:.7}}>Bandlar mashq uchun taxminiy. Reytingda har bir testning birinchi natijasi hisoblanadi.</p>
          {data.results.screenshots?.length > 0 && (
            <>
              <h3>📷 Skrinshot natijalari</h3>
              <p style={{fontSize:12,opacity:.7}}>Rasmdan o‘qilgan, o‘quvchi tasdiqlagan ballar. Grafik maksimal ballga nisbatan foizni ko‘rsatadi. Markaz reytingiga qo‘shilmaydi.</p>
              <LineChart items={data.results.screenshots.slice(-60)} exam="cefr" />
              <table style={{width:'100%'}}><tbody>
                {data.results.screenshots.slice(-30).reverse().map(r => (
                  <tr key={r.id}>
                    <td>{new Date(r.date).toLocaleDateString('uz-UZ', {timeZone:'Asia/Tashkent'})}</td>
                    <td>{r.title}<div style={{fontSize:12,opacity:.7}}>{SECTIONS[r.section]}</div></td>
                    <td style={{textAlign:'right'}}>{r.score_label}</td>
                  </tr>
                ))}
              </tbody></table>
            </>
          )}
          <h3>🏆 O'quv markaz reytingi</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {data.board.leaderboard.slice(0, 50).map((b) => (
                <tr key={b.user_id} style={{ fontWeight: b.user_id === data.board.me ? 700 : 400 }}>
                  <td style={{ padding: 6 }}>{b.place}</td>
                  <td style={{ padding: 6 }}>{b.full_name} <span style={{ opacity: 0.6 }}>{b.group_name}</span></td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{b.average_percent}%{b.average_band != null ? ` · ${b.average_band}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
