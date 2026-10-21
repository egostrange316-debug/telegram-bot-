(function () {
  'use strict';
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const hashToken = new URLSearchParams(location.hash.slice(1)).get('token');
  if (hashToken) history.replaceState(null, '', location.pathname + location.search);
  const headers = tg?.initData ? { 'X-Telegram-Init-Data': tg.initData } : hashToken ? { Authorization: 'Bearer ' + hashToken } : {};
  const sections = { reading: 'Reading', listening: 'Listening', writing: 'Writing' };
  const colors = { reading: '#2a78d6', listening: '#d07528', writing: '#32975a' };
  const trends = { up: '📈 O‘sish', down: '📉 Pasayish', flat: '➡️ Barqaror' };
  const statuses = { analysis: '🧠 Tahlil kerak', done: '✅ Yakunlangan', grading: '⏳ Tekshiruvda' };
  const app = document.getElementById('app');
  let selected = 'ielts', controller;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (value) => new Date(value).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit' });
  async function get(path, signal) {
    const response = await fetch('../api/' + path, { headers, signal, cache: 'no-store' });
    if (!response.ok) throw response.status;
    return response.json();
  }
  function chart(items, exam) {
    if (!items.length) return '<p class="muted">Hali baholangan natija yo‘q.</p>';
    const max = exam === 'ielts' ? 9 : 100;
    const shown = items.slice(-60), w = 640, h = 250, p = 35;
    const x = i => p + (shown.length < 2 ? (w - p * 2) / 2 : i * (w - p * 2) / (shown.length - 1));
    const y = value => h - p - value / max * (h - p * 2);
    let svg = '<svg viewBox="0 0 640 250" role="img" aria-label="Bo‘limlar bo‘yicha natijalar grafigi">';
    for (let i = 0; i <= 4; i++) {
      const value = max * i / 4;
      svg += `<line x1="${p}" x2="${w - p}" y1="${y(value)}" y2="${y(value)}" stroke="currentColor" opacity=".12"/>`;
      svg += `<text x="2" y="${y(value) + 4}" font-size="11" fill="currentColor">${value}${max === 100 ? '%' : ''}</text>`;
    }
    for (const section of Object.keys(sections)) {
      const points = shown.map((item, i) => ({ item, i })).filter(({ item }) => item.section === section);
      const value = item => exam === 'ielts' ? (item.band ?? 0) : item.percent;
      svg += `<polyline points="${points.map(({ item, i }) => `${x(i)},${y(value(item))}`).join(' ')}" fill="none" stroke="${colors[section]}" stroke-width="2.5"/>`;
      for (const { item, i } of points) svg += `<circle cx="${x(i)}" cy="${y(value(item))}" r="4" fill="${colors[section]}"><title>${esc(item.title)} · ${date(item.date)} · ${value(item)}</title></circle>`;
    }
    svg += `<text x="${p}" y="${h - 4}" fill="currentColor" font-size="11">${date(shown[0].date)}</text><text x="${w - p}" y="${h - 4}" text-anchor="end" fill="currentColor" font-size="11">${date(shown.at(-1).date)}</text></svg>`;
    return '<div class="chart">' + svg + '</div><div class="legend">' + Object.keys(sections).map(k => `<span style="color:${colors[k]}">● ${sections[k]}</span>`).join('') + '</div>';
  }
  function render(exam, results, board) {
    const cards = Object.keys(sections).map(k => {
      const value = results.sections[k];
      const score = value.count ? (exam === 'ielts' ? value.average_band : value.average_percent + '%') : '—';
      return `<div class="card"><span>${sections[k]}</span><b>${score}</b><span>${value.count} test</span><div style="font-size:12px">${trends[value.trend.direction] || ''}</div></div>`;
    }).join('');
    const rows = board.leaderboard.map(b => `<tr class="${b.user_id === board.me ? 'me' : ''}"><td class="n">${b.place}</td><td>${esc(b.full_name)}<div class="muted">${esc(b.group_name)}</div></td><td class="r">${b.average_percent}%<div class="muted">${b.tests} test${b.average_band != null ? ' · band ' + b.average_band : ''}</div></td></tr>`).join('');
    const historyRows = results.items.slice(-30).reverse().map(it => `<tr><td>${date(it.date)}</td><td>${esc(it.title)}<div class="muted">${sections[it.section]} · ${statuses[it.status]}</div></td><td class="r">${it.percent}%${it.band != null ? ' · ' + it.band : ''}</td></tr>`).join('');
    document.getElementById('title').textContent = results.student?.full_name ? results.student.full_name + ' — natijalar' : 'Natijalarim';
    app.innerHTML = `<div class="cards">${cards}</div><h2>O‘sish grafigi</h2>${chart(results.items, exam)}<p class="muted" style="font-size:12px">Band va darajalar mashq uchun taxminiy. O‘sish har bir bo‘lim bo‘yicha alohida hisoblanadi.</p><h2>Oxirgi natijalar</h2><div class="scroll"><table>${historyRows || '<tr><td>Natija yo‘q</td></tr>'}</table></div><h2>🏆 O‘quv markaz reytingi</h2><p class="muted" style="font-size:12px">Har testning birinchi natijasi hisoblanadi. Qayta ishlashlar shaxsiy grafikda saqlanadi.</p><table>${rows || '<tr><td>Reyting bo‘sh</td></tr>'}</table>`;
  }
  async function load(exam, quiet = false) {
    controller?.abort();
    const own = controller = new AbortController();
    if (!quiet) app.innerHTML = '<p class="muted">Yuklanmoqda…</p>';
    try {
      const [results, board] = await Promise.all([get(`exams/results?exam=${exam}`, own.signal), get(`exams/leaderboard?exam=${exam}`, own.signal)]);
      if (!own.signal.aborted) render(exam, results, board);
    } catch (error) {
      if (own.signal.aborted) return;
      app.innerHTML = '<div class="err">' + (error === 401 ? 'Avval botda /start orqali kiring, so‘ng grafikni qayta oching.' : 'Ma’lumot yuklanmadi. «Yangilash»ni bosing.') + '</div>';
    }
  }
  document.querySelectorAll('.tabs button').forEach(button => button.addEventListener('click', () => {
    selected = button.dataset.exam;
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b === button));
    void load(selected);
  }));
  document.getElementById('refresh').addEventListener('click', () => { void load(selected); });
  setInterval(() => { if (!document.hidden) void load(selected, true); }, 30_000);
  void load(selected);
})();
