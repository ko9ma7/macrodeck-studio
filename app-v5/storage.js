import { STORAGE_KEYS } from './config.js';

export const defaultLayout = {
  sort: 'custom',
  density: 'compact',
  columns: 'auto',
  showOnlyFavorites: false,
  order: [],
  hidden: [],
};

function safeGet(key, fallback = null) {
  try { return globalThis.localStorage?.getItem(key) ?? fallback; } catch { return fallback; }
}
function safeSet(key, value) {
  try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
}

export function loadLayout() {
  try { return { ...defaultLayout, ...JSON.parse(safeGet(STORAGE_KEYS.layout, '{}') || '{}') }; }
  catch { return { ...defaultLayout }; }
}
export function saveLayout(layout) { safeSet(STORAGE_KEYS.layout, JSON.stringify(layout)); }
export function loadFavorites() {
  try { return new Set(JSON.parse(safeGet(STORAGE_KEYS.favorites, '[]') || '[]')); }
  catch { return new Set(); }
}
export function saveFavorites(set) { safeSet(STORAGE_KEYS.favorites, JSON.stringify([...set])); }
export function loadTheme() { return safeGet(STORAGE_KEYS.theme, 'system') || 'system'; }
export function saveTheme(theme) { safeSet(STORAGE_KEYS.theme, theme); }
