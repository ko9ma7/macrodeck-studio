import { loadDashboardData } from './data.js';
import { loadFavorites, loadLayout, loadTheme, saveFavorites, saveLayout, saveTheme } from './storage.js';
import { sparkline } from './spark.js';

const state = {
  cards: [],
  favorites: loadFavorites(),
  layout: loadLayout(),
  search: '',
  group: '전체',
};

const els = {
  grid: document.querySelector('#cards'),
  search: document.querySelector('#search'),
  group: document.querySelector('#groupFilter'),
  sort: document.querySelector('#sort'),
  density: document.querySelector('#density'),
  columns: document.querySelector('#columns'),
  favoritesOnly: document.querySelector('#favoritesOnly'),
  theme: document.querySelector('#theme'),
  status: document.querySelector('#statusText'),
  empty: document.querySelector('#empty'),
  reset: document.querySelector('#resetLayout'),
  exportPrefs: document.querySelector('#exportPrefs'),
  importPrefs: document.querySelector('#importPrefs'),
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.theme.value = theme;
}

function syncControls() {
  els.sort.value = state.layout.sort;
  els.density.value = state.layout.density;
  els.columns.value = state.layout.columns;
  els.favoritesOnly.checked = state.layout.showOnlyFavorites;
  document.documentElement.dataset.density = state.layout.density;
  document.documentElement.style.setProperty('--user-cols', state.layout.columns === 'auto' ? 'repeat(auto-fit, minmax(min(100%, 248px), 1fr))' : `repeat(${state.layout.columns}, minmax(0, 1fr))`);
}

function orderedCards(cards) {
  const byId = new Map(cards.map(card => [card.id, card]));
  const order = state.layout.order.filter(id => byId.has(id));
  const missing = cards.map(card => card.id).filter(id => !order.includes(id));
  state.layout.order = [...order, ...missing];
  saveLayout(state.layout);
  return state.layout.order.map(id => byId.get(id)).filter(Boolean);
}

function filteredCards() {
  let cards = state.cards.filter(card => !state.layout.hidden.includes(card.id));
  const q = state.search.trim().toLowerCase();
  if (q) cards = cards.filter(card => [card.title, card.group, card.status, card.note, card.source].join(' ').toLowerCase().includes(q));
  if (state.group !== '전체') cards = cards.filter(card => card.group === state.group);
  if (state.layout.showOnlyFavorites) cards = cards.filter(card => state.favorites.has(card.id));

  if (state.layout.sort === 'priority') return [...cards].sort((a,b) => b.priority - a.priority);
  if (state.layout.sort === 'change') return [...cards].sort((a,b) => Math.abs(b.change ?? -Infinity) - Math.abs(a.change ?? -Infinity));
  if (state.layout.sort === 'name') return [...cards].sort((a,b) => a.title.localeCompare(b.title, 'ko'));
  if (state.layout.sort === 'group') return [...cards].sort((a,b) => a.group.localeCompare(b.group, 'ko') || b.priority - a.priority);
  return orderedCards(cards);
}

function formatChange(value) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `<span class="change ${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${sign}${n.toFixed(2)}%</span>`;
}

function render() {
  syncControls();
  const cards = filteredCards();
  els.empty.hidden = cards.length > 0;
  els.grid.innerHTML = cards.map((card, index) => {
    const favorite = state.favorites.has(card.id);
    const src = card.sourceUrl ? `<a class="source-link" href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(card.source || '출처')}</a>` : escapeHtml(card.source || '');
    return `<article class="metric-card tone-${card.tone}" data-id="${escapeHtml(card.id)}" draggable="${state.layout.sort === 'custom'}">
      <div class="card-topline"><span class="eyebrow">${escapeHtml(card.group)}</span><div class="card-actions">
        <button class="icon-btn favorite ${favorite ? 'active' : ''}" data-action="favorite" aria-label="${favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">★</button>
        <button class="icon-btn" data-action="hide" aria-label="카드 숨기기">×</button>
      </div></div>
      <div class="metric-title-row"><h2>${escapeHtml(card.title)}</h2><span class="pill">${escapeHtml(card.status)}</span></div>
      <div class="metric-value-row"><strong>${escapeHtml(card.value)}${escapeHtml(card.unit)}</strong>${formatChange(card.change)}</div>
      ${card.spark?.length > 1 ? sparkline(card.spark, card.tone) : '<div class="spark-placeholder" aria-hidden="true"></div>'}
      <div class="metric-meta">
        <span>${escapeHtml(card.note)}</span>
        <span>${src}${card.asOf ? `${src ? ' · ' : ''}${escapeHtml(String(card.asOf).slice(0,10))}` : ''}</span>
      </div>
      ${state.layout.sort === 'custom' ? `<div class="reorder"><button data-action="left" ${index === 0 ? 'disabled' : ''}>←</button><span>순서</span><button data-action="right" ${index === cards.length - 1 ? 'disabled' : ''}>→</button></div>` : ''}
    </article>`;
  }).join('');
}

function buildGroupOptions() {
  const groups = ['전체', ...new Set(state.cards.map(card => card.group))];
  els.group.innerHTML = groups.map(group => `<option>${escapeHtml(group)}</option>`).join('');
}

function moveCard(id, delta) {
  const order = state.layout.order.length ? [...state.layout.order] : state.cards.map(card => card.id);
  const index = order.indexOf(id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= order.length) return;
  [order[index], order[next]] = [order[next], order[index]];
  state.layout.order = order;
  saveLayout(state.layout);
  render();
}

els.grid.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  const card = event.target.closest('[data-id]');
  if (!button || !card) return;
  const id = card.dataset.id;
  const action = button.dataset.action;
  if (action === 'favorite') {
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    saveFavorites(state.favorites);
  }
  if (action === 'hide') {
    state.layout.hidden = [...new Set([...state.layout.hidden, id])];
    saveLayout(state.layout);
  }
  if (action === 'left') moveCard(id, -1);
  if (action === 'right') moveCard(id, 1);
  render();
});

let dragId = null;
els.grid.addEventListener('dragstart', e => { dragId = e.target.closest('[data-id]')?.dataset.id || null; });
els.grid.addEventListener('dragover', e => { if (state.layout.sort === 'custom') e.preventDefault(); });
els.grid.addEventListener('drop', e => {
  if (!dragId || state.layout.sort !== 'custom') return;
  e.preventDefault();
  const targetId = e.target.closest('[data-id]')?.dataset.id;
  if (!targetId || targetId === dragId) return;
  const order = state.layout.order.length ? [...state.layout.order] : state.cards.map(card => card.id);
  const from = order.indexOf(dragId);
  const to = order.indexOf(targetId);
  order.splice(to, 0, order.splice(from, 1)[0]);
  state.layout.order = order;
  saveLayout(state.layout);
  render();
});

els.search.addEventListener('input', e => { state.search = e.target.value; render(); });
els.group.addEventListener('change', e => { state.group = e.target.value; render(); });
for (const [el, key] of [[els.sort,'sort'], [els.density,'density'], [els.columns,'columns']]) {
  el.addEventListener('change', e => { state.layout[key] = e.target.value; saveLayout(state.layout); render(); });
}
els.favoritesOnly.addEventListener('change', e => { state.layout.showOnlyFavorites = e.target.checked; saveLayout(state.layout); render(); });
els.theme.addEventListener('change', e => { saveTheme(e.target.value); applyTheme(e.target.value); });
els.reset.addEventListener('click', () => {
  if (!confirm('카드 순서, 숨김, 보기 설정을 초기화할까요? 즐겨찾기는 유지됩니다.')) return;
  state.layout = { sort:'custom', density:'comfortable', columns:'auto', showOnlyFavorites:false, order:[], hidden:[] };
  saveLayout(state.layout);
  render();
});
els.exportPrefs.addEventListener('click', () => {
  const payload = { version: 1, layout: state.layout, favorites: [...state.favorites], exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'macrodeck-preferences.json'; a.click(); URL.revokeObjectURL(a.href);
});
els.importPrefs.addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!payload.layout) throw new Error('layout 필드가 없습니다.');
    state.layout = { ...state.layout, ...payload.layout };
    state.favorites = new Set(Array.isArray(payload.favorites) ? payload.favorites : []);
    saveLayout(state.layout); saveFavorites(state.favorites); render();
  } catch (error) { alert(`설정 파일을 읽지 못했습니다: ${error.message}`); }
  e.target.value = '';
});

async function start() {
  applyTheme(loadTheme());
  try {
    const data = await loadDashboardData();
    state.cards = data.cards;
    state.layout.order = state.layout.order.length ? state.layout.order : state.cards.map(card => card.id);
    buildGroupOptions();
    els.status.textContent = `스냅샷 ${new Date(data.generatedAt).toLocaleString('ko-KR')} · ${state.cards.length}개 지표`;
    render();
  } catch (error) {
    console.error(error);
    els.status.textContent = '데이터를 불러오지 못했습니다.';
    document.querySelector('#error').hidden = false;
  }
}

start();
