const state = { data: window.AIPRI_EVENT_DATA, query: '', date: 'all', age: 'all', time: 'all', sort: 'date' };
const $ = (s) => document.querySelector(s);

window.addEventListener('DOMContentLoaded', async () => {
  bindTabs();
  bindControls();
  setupDateFilter();
  render();
  await refresh(true);
});

function bindTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === button));
    $('#currentPanel').hidden = tab !== 'current';
    $('#infoPanel').hidden = tab !== 'info';
  }));
}

function bindControls() {
  $('#searchInput').addEventListener('input', (e) => { state.query = e.target.value; render(); });
  $('#dateFilter').addEventListener('change', (e) => { state.date = e.target.value; render(); });
  $('#ageFilter').addEventListener('change', (e) => { state.age = e.target.value; render(); });
  $('#timeFilter').addEventListener('change', (e) => { state.time = e.target.value; render(); });
  $('#sortFilter').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('#refreshBtn').addEventListener('click', () => refresh(false));
}

async function refresh(initial) {
  $('#refreshBtn').disabled = true;
  $('#sourceStamp').textContent = initial ? '公式情報を更新中…' : '更新中…';
  try {
    const response = await fetch('/api/refresh?event_id=10', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const refreshed = await response.json();
    if (!refreshed?.shops?.length) throw new Error('empty event data');
    state.data = refreshed;
    setupDateFilter();
    render();
    $('#sourceStamp').textContent = `公式取得 ${formatTimestamp(state.data.fetchedAt)} / ${state.data.shops.length}店舗`;
  } catch (error) {
    const count = state.data?.shops?.length || 0;
    $('#sourceStamp').textContent = `同梱初期データ ${count}店舗（公式更新は再試行できます）`;
  } finally {
    $('#refreshBtn').disabled = false;
  }
}

function setupDateFilter() {
  if (!state.data?.shops) return;
  const dates = [...new Set(state.data.shops.flatMap((s) => s.events.map((e) => e.date)).filter(Boolean))].sort();
  const select = $('#dateFilter');
  const previous = state.date;
  select.innerHTML = '<option value="all">すべて</option>' + dates.map((d) => `<option value="${d}">${formatDate(d)}</option>`).join('');
  state.date = dates.includes(previous) ? previous : 'all';
  select.value = state.date;
}

function getFiltered() {
  const q = normalize(state.query);
  return state.data.shops.map((shop) => {
    const events = shop.events.filter((event) => {
      if (state.date !== 'all' && event.date !== state.date) return false;
      if (state.age !== 'all' && event.ageLimit !== state.age) return false;
      if (!timeMatches(event.registrationTime || event.startTime)) return false;
      return !q || normalize(`${shop.prefecture} ${shop.name} ${shop.address} ${shop.participation} ${eventText(event)}`).includes(q);
    });
    return events.length ? { shop, events } : null;
  }).filter(Boolean).sort((a, b) => state.sort === 'name' ? a.shop.name.localeCompare(b.shop.name, 'ja') : firstEventKey(a.events).localeCompare(firstEventKey(b.events), 'ja'));
}

function render() {
  if (!state.data?.shops) return;
  const items = getFiltered();
  const eventTotal = items.reduce((sum, item) => sum + item.events.length, 0);
  $('#resultCount').textContent = `${items.length}店舗`;
  $('#eventCount').textContent = `${eventTotal}大会`;
  $('#shopList').innerHTML = items.length ? items.map(renderShop).join('') : '<div class="empty">条件に合う開催店舗がありません。</div>';
}

function renderShop({ shop, events }) {
  return `<article class="shop-card">
    <div class="shop-head"><div><h2>${escapeHtml(shop.name)}</h2><p>${escapeHtml(shop.prefecture || '')}${escapeHtml(shop.address || '')}</p></div><a class="map-link" href="${escapeAttr(shop.mapsSearchUrl || mapsUrl(shop))}" target="_blank" rel="noopener">Googleマップ</a></div>
    <div class="events">${events.map((event) => renderEvent(shop, event)).join('')}</div>
  </article>`;
}

function renderEvent(shop, event) {
  const calendar = calendarUrl(shop, event);
  return `<div class="event">
    <div class="event-date"><strong>${formatDate(event.date)}</strong><span>${escapeHtml(event.label || '大会')}</span></div>
    <div><span class="badge ${event.ageLimit === '年齢無制限' ? 'free' : 'junior'}">${escapeHtml(event.ageLimit || '年齢制限未記載')}</span></div>
    <div><strong>開催 ${escapeHtml(event.startTime || '未記載')}</strong><small>受付 ${escapeHtml(event.registrationTime || '未記載')} / 抽選 ${escapeHtml(event.lotteryTime || '未記載')}</small></div>
    <div class="event-actions"><a href="${escapeAttr(routeUrl(shop))}" target="_blank" rel="noopener">経路</a><a href="${escapeAttr(calendar)}" target="_blank" rel="noopener">カレンダー</a></div>
    ${event.note ? `<p class="note">${escapeHtml(event.note)}</p>` : ''}
  </div>`;
}

function calendarUrl(shop, event) {
  const details = [state.data.eventName, `店舗: ${shop.name}`, `住所: ${shop.address}`, `日程: ${event.dateDisplay || event.date}`, `年齢制限: ${event.ageLimit}`, `参加受付時間: ${event.registrationTime}`, `抽選開始時間: ${event.lotteryTime}`, `開催時間: ${event.startTime}`, event.note ? `備考: ${event.note}` : '', `公式: ${state.data.sourceUrl}`].filter(Boolean).join('\n');
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', `${event.label || 'アイプリチャレンジ'} ${shop.name}`);
  u.searchParams.set('dates', `${event.date.replaceAll('-', '')}/${addDay(event.date).replaceAll('-', '')}`);
  u.searchParams.set('details', details);
  u.searchParams.set('location', `${shop.name} ${shop.prefecture || ''}${shop.address || ''}`);
  u.searchParams.set('ctz', 'Asia/Tokyo');
  return u.toString();
}

function routeUrl(shop) { const u = new URL('https://www.google.com/maps/dir/'); u.searchParams.set('api','1'); u.searchParams.set('destination',`${shop.name} ${shop.address}`); u.searchParams.set('travelmode','transit'); return u.toString(); }
function mapsUrl(shop) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name} ${shop.address}`)}`; }
function firstEventKey(events) { const e = [...events].sort((a,b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))[0]; return `${e?.date || '9999-12-31'} ${e?.startTime || '99:99'}`; }
function eventText(e) { return [e.label,e.dateDisplay,e.ageLimit,e.startTime,e.registrationTime,e.lotteryTime,e.note].join(' '); }
function timeMatches(value) { if (state.time === 'all') return true; const m = String(value || '').match(/(\d{1,2}):(\d{2})/); if (!m) return false; const n = +m[1]*60 + +m[2]; if (state.time === 'morning') return n < 720; if (state.time === 'midday') return n >= 720 && n < 840; return n >= 840; }
function formatDate(s) { if (!s) return '未記載'; return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(`${s}T00:00:00+09:00`)); }
function formatTimestamp(s) { return s ? new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(new Date(s)) : '未記録'; }
function addDay(s) { const d = new Date(`${s}T00:00:00+09:00`); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
function normalize(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim(); }
function escapeHtml(s) { return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function escapeAttr(s) { return escapeHtml(s); }
