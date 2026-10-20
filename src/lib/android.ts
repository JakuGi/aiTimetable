/** The Android app (android/) is this site in a WebView; it adds window.RozvrhAndroid. */
interface AndroidBridge {
  version(): string;
  setBars(top: string, bottom: string, dark: boolean): void;
  canNotify(): boolean;
  requestNotifications(): void;
  notify(title: string, body: string, key: string): void;
  schedule(json: string): void;
  openExternal(url: string): void;
}

/** the latest release on GitHub, always under the same name */
export const APK_URL = 'https://github.com/JakuGi/aiTimetable/releases/latest/download/Rozvrh.apk';

export function android(): AndroidBridge | null {
  return (window as Window & { RozvrhAndroid?: AndroidBridge }).RozvrhAndroid ?? null;
}

export const inAndroidApp = () => android() !== null;

export const isAndroidPhone = () => /Android/i.test(navigator.userAgent);

/** A reminder the app shows by itself, even when it is closed. */
export interface NativeReminder {
  key: string;
  /** ms since epoch */
  at: number;
  title: string;
  body: string;
}

let lastSchedule = '';
export function scheduleNative(items: NativeReminder[]) {
  const a = android();
  if (!a) return;
  const json = JSON.stringify(items);
  if (json === lastSchedule) return;
  lastSchedule = json;
  a.schedule(json);
}

const hex = (rgb: string) => {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3 || m[3] === '0') return null;
  return `#${m
    .slice(0, 3)
    .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0'))
    .join('')}`;
};

/** Colour the status and navigation bars like the page: paper on top, the bottom bar's colour below. */
export function syncSystemBars() {
  const a = android();
  if (!a) return;
  requestAnimationFrame(() => {
    const css = getComputedStyle(document.documentElement);
    const top = hex(getComputedStyle(document.body).backgroundColor) ?? '#f7f9fc';
    const nav = document.querySelector('.nav');
    const bottom = (nav && hex(getComputedStyle(nav).backgroundColor)) || top;
    a.setBars(top, bottom, css.colorScheme.includes('dark') && !css.colorScheme.includes('light'));
  });
}
