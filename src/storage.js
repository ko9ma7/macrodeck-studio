import { STORAGE_KEYS } from './config.js';

export const defaultLayout = {
  sort: 'custom',
  density: 'compact',
  columns: 'auto',
  showOnlyFavorites: false,
  order: [],
  hidden: [],
};

export function loadLayout() {
  try {
    return { ...defaultLayout, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.layout) || '{}') };
  } catch {
    return { ...defaultLayout };
  }
}

export function saveLayout(layout) {
  localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(layout));
}

export function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || '[]'));
  } catch {
    return new Set();
  }
}

export function saveFavorites(set) {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...set]));
}

export function loadTheme() {
  return localStorage.getItem(STORAGE_KEYS.theme) || 'system';
}

export function saveTheme(theme) {
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}
