import { useSyncExternalStore } from 'react';
import cs from '../locales/cs';
import en from '../locales/en';

/**
 * Texts are written in Slovak right in the code; t() looks the Slovak text up in the Czech or
 * English dictionary (src/locales) and falls back to it. {name} in a text is filled from vars.
 */
export type Lang = 'sk' | 'cs' | 'en';

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'sk', label: 'Slovenčina' },
  { value: 'cs', label: 'Čeština' },
  { value: 'en', label: 'English' },
];

const KEY = 'rozvrh.lang';
/** chosen before signing in: wins over the language saved in the profile */
const PENDING = 'rozvrh.lang.pending';
const DICTS: Record<Exclude<Lang, 'sk'>, Record<string, string>> = { cs, en };

const isLang = (v: unknown): v is Lang => v === 'sk' || v === 'cs' || v === 'en';

function detect(): Lang {
  // tests (no browser) read the Slovak texts
  if (typeof window === 'undefined') return 'sk';
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* private mode */
  }
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  for (const l of langs) {
    const code = l.slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return 'sk';
}

let current: Lang = detect();
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang, opts: { beforeSignIn?: boolean } = {}) {
  try {
    localStorage.setItem(KEY, lang);
    if (opts.beforeSignIn) localStorage.setItem(PENDING, '1');
  } catch {
    /* private mode: the choice just won't persist */
  }
  if (lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

function takePending(): boolean {
  try {
    if (localStorage.getItem(PENDING) !== '1') return false;
    localStorage.removeItem(PENDING);
    return true;
  } catch {
    return false;
  }
}

/** a language on its way to the profile: until the profile shows it, the old one there is not adopted */
let saving: Lang | null = null;

/** Picked while signed in: saved to the profile, then shown. */
export function chooseLang(lang: Lang, save: (lang: Lang) => void) {
  saving = lang;
  save(lang);
  setLang(lang);
}

/**
 * The profile's language follows the user to other devices. A language picked on the sign-in
 * page (or none saved yet) goes to the profile instead.
 */
export function reconcileLang(profileLang: string | null, save: (lang: Lang) => void) {
  if (takePending() || !isLang(profileLang)) {
    saving = current;
    if (profileLang !== current) save(current);
    return;
  }
  if (saving) {
    if (profileLang === saving) saving = null;
    return;
  }
  if (profileLang !== current) setLang(profileLang);
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

export function t(sk: string, vars?: Record<string, string | number>): string {
  const text = current === 'sk' ? sk : (DICTS[current][sk] ?? sk);
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Slovak plural forms (1 / 2–4 / 5+), each translated; Czech counts the same, English uses one / other. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  return t(abs === 1 ? one : abs >= 2 && abs <= 4 ? few : many);
}
