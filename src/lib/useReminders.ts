import { useEffect, useRef } from 'react';
import { useData } from './data';
import { useToast } from '../components/Toast';
import { fmtTime, MINUTE } from './time';

const FIRED_KEY = 'rozvrh.fired';
const SESSION_KEY = 'rozvrh.sessionAlerts';
const GRACE = 10 * MINUTE; // still show a reminder that was due up to 10 min ago

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function requestNotifications(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  return Notification.requestPermission();
}

export function getSessionAlerts() {
  try {
    return localStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSessionAlerts(on: boolean) {
  try {
    localStorage.setItem(SESSION_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

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
 * Shows reminders while the app is open (browser notification + in-app toast).
 * Background push on a closed app needs a push service; see README.
 */
export function useReminders() {
  const { events, sessions, taskById, gigs, profile } = useData();
  const notify = useToast();
  const fired = useRef(loadFired());

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due: { key: string; title: string; body: string }[] = [];

      for (const e of events) {
        if (e.remind_minutes_before === null) continue;
        const start = new Date(e.starts_at).getTime();
        const at = start - e.remind_minutes_before * MINUTE;
        if (now >= at && now - at < GRACE) {
          due.push({
            key: `e:${e.id}:${e.starts_at}:${e.remind_minutes_before}`,
            title: e.title,
            body: e.all_day ? 'Dnes' : `${fmtTime(e.starts_at)}${e.location ? `, ${e.location}` : ''}`,
          });
        }
      }

      // freelance: time to get ready / leave for an event gig
      if (profile?.freelance_enabled) {
        for (const g of gigs) {
          if (g.mode !== 'event' || !g.starts_at || g.status === 'cancelled' || g.status === 'done' || g.status === 'paid') continue;
          const before = g.prep_minutes + g.travel_minutes;
          const at = new Date(g.starts_at).getTime() - before * MINUTE;
          if (now >= at && now - at < GRACE) {
            due.push({
              key: `g:${g.id}:${g.starts_at}:${before}`,
              title: g.title,
              body: before ? `Čas na ${g.prep_minutes ? 'prípravu' : 'cestu'}, začiatok o ${fmtTime(g.starts_at)}` : `Začína sa o ${fmtTime(g.starts_at)}`,
            });
          }
        }
      }

      if (getSessionAlerts()) {
        for (const s of sessions) {
          if (s.status !== 'planned') continue;
          const at = new Date(s.starts_at).getTime();
          if (now >= at && now - at < GRACE) {
            const title = s.kind === 'leisure' ? 'Voľný čas' : (taskById(s.task_id)?.title ?? 'Blok práce');
            due.push({ key: `s:${s.id}:${s.starts_at}`, title, body: `Teraz do ${fmtTime(s.ends_at)}` });
          }
        }
      }

      let changed = false;
      for (const d of due) {
        if (fired.current.has(d.key)) continue;
        fired.current.add(d.key);
        changed = true;
        notify(`${d.title}: ${d.body}`, 'info');
        if (notificationsSupported() && Notification.permission === 'granted') {
          try {
            new Notification(d.title, { body: d.body, icon: '/pwa-192x192.png', tag: d.key });
          } catch {
            /* some mobile browsers only allow notifications from a service worker */
          }
        }
      }
      if (changed) saveFired(fired.current);
    };

    check();
    const t = setInterval(check, 20_000);
    return () => clearInterval(t);
  }, [events, sessions, taskById, gigs, profile, notify]);
}
