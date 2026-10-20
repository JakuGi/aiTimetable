import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { applyTheme } from './lib/theme';
import { inAndroidApp, syncSystemBars } from './lib/android';
import './styles.css';

applyTheme();
registerSW({ immediate: true });
if (inAndroidApp()) {
  document.documentElement.classList.add('in-app');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncSystemBars);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
