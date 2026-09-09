import { loadTheme, saveTheme } from './storage.js';
import { UI_STYLES, applyUiStyle, loadUiStyle, saveUiStyle } from './theme-manager.js';

export function initShell(active='monitor') {
  const theme = document.querySelector('#theme');
  const uiStyle = document.querySelector('#uiStyle');
  document.documentElement.dataset.theme = loadTheme();
  if (theme) {
    theme.value = loadTheme();
    theme.addEventListener('change', () => {
      saveTheme(theme.value);
      document.documentElement.dataset.theme = theme.value;
    });
  }
  if (uiStyle) {
    uiStyle.innerHTML = UI_STYLES.map(item=>`<option value="${item.id}">${item.label}</option>`).join('');
    uiStyle.value = applyUiStyle(loadUiStyle());
    uiStyle.addEventListener('change',()=>uiStyle.value=applyUiStyle(saveUiStyle(uiStyle.value)));
  } else {
    applyUiStyle(loadUiStyle());
  }
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===active));
}
