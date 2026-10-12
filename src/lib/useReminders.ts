import { useEffect, useRef } from 'react';
import { useData } from './data';
import { useToast } from '../components/Toast';
import { fmtTime, MINUTE } from './time';
import { pushOnThisDevice } from './push';

const FIRED_KEY = 'rozvrh.fired';
const GRACE = 10 * MINUTE;
/** same rule as the server: from the reminder time until the thing starts (moved or late items too) */
const sendable = (at: number, start: number, now: number) => at <= now && now < Math.max(start, at + GRACE);

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveFired(s: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-300)));
  } catch {
    /* ignore */
  }
}

/**
 * Reminders while the app is open: an in-app toast, plus a system notification on devices
 * that don't get server push (those already receive the same reminder from the server).
 * Follows the same preferences as push notifications.
 */
export function useReminders() {
  const { events, sessions, taskById, gigs, profile } = useData();
  const notify = useToast();
  const fired = useRef(loadFired());

  useEffect(() => {
    if (!profile) return;
    const check = () => {
      const now = Date.now();
      const due: { key: string; title: string; body: string }[] = [];

      if (profile.notify_events) {
        for (const e of events) {
          if (e.remind_minutes_before === null) continue;
          const start = new Date(e.starts_at).getTime();
          if (sendable(start - e.remind_minutes_before * MINUTE, start, now)) {
            due.push({
              key: `e:${e.id}:${e.starts_at}:${e.remind_minutes_before}`,
              title: e.title,
              body: e.all_day ? 'Dnes' : `${fmtTime(e.starts_at)}${e.location ? `, ${e.location}` : ''}`,
            });
          }
        }
      }

      if (profile.freelance_enabled && profile.notify_gigs) {
        for (const g of gigs) {
          if (g.mode !== 'event' || !g.starts_at || (g.status !== 'planned' && g.status !== 'confirmed')) continue;
          const before = g.prep_minutes + g.travel_minutes;
          const start = new Date(g.starts_at).getTime();
          if (sendable(start - before * MINUTE, start, now)) {
            due.push({
              key: `g:${g.id}:${g.starts_at}:${before}`,
              title: before ? `Čas vyraziť: ${g.title}` : g.title,
              body: `Začiatok o ${fmtTime(g.starts_at)}`,
            });
          }
        }
      }

      if (profile.notify_sessions) {
        for (const s of sessions) {
          if (s.status !== 'planned') continue;
          const start = new Date(s.starts_at).getTime();
          if (sendable(start - profile.session_lead_minutes * MINUTE, start, now)) {
            const title = s.kind === 'leisure' ? 'Voľný čas' : (taskById(s.task_id)?.title ?? 'Blok práce');
            due.push({
              key: `s:${s.id}:${s.starts_at}:${profile.session_lead_minutes}`,
              title,
              body: `${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`,
            });
          }
        }
      }

      const systemToo = !pushOnThisDevice() && 'Notification' in window && Notification.permission === 'granted';
      let changed = false;
      for (const d of due) {
        if (fired.current.has(d.key)) continue;
        fired.current.add(d.key);
        changed = true;
        notify(`${d.title}: ${d.body}`, 'info');
        if (systemToo) {
          const options = { body: d.body, icon: '/pwa-192x192.png', badge: '/badge-96x96.png', tag: d.key };
          navigator.serviceWorker
            ?.getRegistration()
            .then((reg) => {
              if (reg) return reg.showNotification(d.title, options);
              new Notification(d.title, options);
            })
            .catch(() => {});
        }
      }
      if (changed) saveFired(fired.current);
    };

    check();
    const t = setInterval(check, 20_000);
    return () => clearInterval(t);
  }, [events, sessions, taskById, gigs, profile, notify]);
}
