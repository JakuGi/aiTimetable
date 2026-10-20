import { syncSystemBars } from './android';

export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'rozvrh.theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(t: Theme = getTheme()) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  syncSystemBars();
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode: theme just won't persist */
  }
  applyTheme(t);
}
