import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const FLAG = 'rozvrh.push';

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export type PushSupport = 'ok' | 'ios-install' | 'unsupported' | 'not-configured';

/** iPhone only allows web push for apps added to the home screen (iOS 16.4+). */
export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  const api = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios-install';
  return api ? 'ok' : 'unsupported';
}

/** Is this device subscribed? Remembered locally so in-app reminders don't double the pushes. */
export function pushOnThisDevice() {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}
function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    /* private mode */
  }
}

export function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua)
    ? 'Android'
    : isIOS()
      ? /iPad/.test(ua) || navigator.maxTouchPoints > 1 && /Mac/.test(ua) ? 'iPad' : 'iPhone'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Zariadenie';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const kind = isStandalone() ? 'appka' : browser;
  return kind ? `${os}, ${kind}` : os;
}

function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (pushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = (await reg?.pushManager.getSubscription()) ?? null;
  remember(Boolean(sub));
  return sub;
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  return supabase.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', device: deviceName() },
    { onConflict: 'endpoint' },
  );
}

export type EnableResult = { ok: true } | { ok: false; reason: 'denied' | 'dismissed' | 'unsupported' | 'error'; message?: string };

export async function enablePush(): Promise<EnableResult> {
  if (pushSupport() !== 'ok') return { ok: false, reason: 'unsupported' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' };
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) });
    let { error } = await save(sub);
    if (error) {
      // this browser's subscription still belongs to another account: start a fresh one
      await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) });
      ({ error } = await save(sub));
    }
    if (error) return { ok: false, reason: 'error', message: error.message };
    remember(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

/** Stop pushes to this device (also used on sign-out, so the next account doesn't inherit them). */
export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  remember(false);
}

export async function sendTestPush(): Promise<{ sent: number; failed: number; devices: number } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('send-notifications', { body: { test: true } });
  if (error) return { error: error.message };
  return data;
}
