import { STORAGE_KEYS } from './config.js';

export const UI_STYLES = [
  { id: 'monitor', label: 'Monitor · 기본' },
  { id: 'terminal', label: 'Terminal · 트레이딩' },
  { id: 'swiss', label: 'Swiss · 그리드' },
  { id: 'editorial', label: 'Editorial · 리포트' },
  { id: 'blueprint', label: 'Blueprint · 테크니컬' },
  { id: 'glass', label: 'Glass · 글래스' },
  { id: 'cyber', label: 'Cyber · 네온' },
  { id: 'ledger', label: 'Ledger · 금융원장' },
];

const allowed = new Set(UI_STYLES.map(item => item.id));

export function loadUiStyle() {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.uiStyle) || 'monitor';
    return allowed.has(value) ? value : 'monitor';
  } catch {
    return 'monitor';
  }
}

export function saveUiStyle(value) {
  const safe = allowed.has(value) ? value : 'monitor';
  try { localStorage.setItem(STORAGE_KEYS.uiStyle, safe); } catch {}
  return safe;
}

export function applyUiStyle(value) {
  const safe = allowed.has(value) ? value : 'monitor';
  const link = document.querySelector('#uiStyleSheet');
  if (link) { const u = new URL(`./themes/${safe}.css`, import.meta.url); u.searchParams.set('b','20260909-1'); link.href = u.href; }
  document.documentElement.dataset.uiStyle = safe;
  return safe;
}
