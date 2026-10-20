import { useEffect, useRef } from 'react';
import { useData } from './data';
import { useToast } from '../components/Toast';
import { fmtTime, MINUTE } from './time';
import { pushOnThisDevice } from './push';
import { android, scheduleNative, type NativeReminder } from './android';
import { t } from './i18n';
import type { Profile } from './types';

const FIRED_KEY = 'rozvrh.fired';
const GRACE = 10 * MINUTE;
/** how far ahead the Android app keeps reminders as alarms */
const AHEAD = 3 * 24 * 60 * MINUTE;
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

interface Reminder extends NativeReminder {
  /** when the thing itself starts */
  start: number;
  /** a work block: quiet hours hold it back */
  session: boolean;
}

type ReminderData = Pick<ReturnType<typeof useData>, 'events' | 'sessions' | 'taskById' | 'gigs'> & { profile: Profile };

/** Every reminder by the push preferences: events, leaving for gigs, accepted work blocks. */
function reminders({ events, sessions, taskById, gigs, profile }: ReminderData): Reminder[] {
  const out: Reminder[] = [];
  if (profile.notify_events) {
    for (const e of events) {
      if (e.remind_minutes_before === null) continue;
      const start = new Date(e.starts_at).getTime();
      out.push({
        key: `e:${e.id}:${e.starts_at}:${e.remind_minutes_before}`,
        at: start - e.remind_minutes_before * MINUTE,
        start,
        session: false,
        title: e.title,
        body: e.all_day ? t('Dnes') : `${fmtTime(e.starts_at)}${e.location ? `, ${e.location}` : ''}`,
      });
    }
  }

  if (profile.freelance_enabled && profile.notify_gigs) {
    for (const g of gigs) {
      if (g.mode !== 'event' || !g.starts_at || (g.status !== 'planned' && g.status !== 'confirmed')) continue;
      const before = g.prep_minutes + g.travel_minutes;
      const start = new Date(g.starts_at).getTime();
      out.push({
        key: `g:${g.id}:${g.starts_at}:${before}`,
        at: start - before * MINUTE,
        start,
        session: false,
        title: before ? t('Čas vyraziť: {title}', { title: g.title }) : g.title,
        body: t('Začiatok o {time}', { time: fmtTime(g.starts_at) }),
      });
    }
  }

  if (profile.notify_sessions) {
    for (const s of sessions) {
      if (s.status !== 'planned') continue;
      const start = new Date(s.starts_at).getTime();
      out.push({
        key: `s:${s.id}:${s.starts_at}:${profile.session_lead_minutes}`,
        at: start - profile.session_lead_minutes * MINUTE,
        start,
        session: true,
        title: s.kind === 'leisure' ? t('Voľný čas') : (taskById(s.task_id)?.title ?? t('Blok práce')),
        body: `${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`,
      });
    }
  }
  return out;
}

/** quiet hours, like the server: only work-block reminders wait them out */
function inQuiet(profile: Profile, at: number) {
  if (!profile.quiet_enabled) return false;
  const d = new Date(at);
  const m = d.getHours() * 60 + d.getMinutes();
  const [fh, fm] = profile.quiet_from.split(':').map(Number);
  const [th, tm] = profile.quiet_to.split(':').map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/**
 * Reminders while the app is open: an in-app toast, plus a system notification on devices
 * that don't get server push (those already receive the same reminder from the server).
 * In the Android app they are also handed over as alarms, so they come with the app closed.
 * Follows the same preferences as push notifications.
 */
export function useReminders() {
  const { events, sessions, taskById, gigs, profile } = useData();
  const notify = useToast();
  const fired = useRef(loadFired());

  useEffect(() => {
    if (!profile) return;
    const all = reminders({ events, sessions, taskById, gigs, profile });
    const app = android();
    const check = () => {
      const now = Date.now();
      const due = all.filter((r) => sendable(r.at, r.start, now));
      if (app) {
        scheduleNative(
          all
            .filter((r) => r.start > now && r.at > now - GRACE && r.at < now + AHEAD && !(r.session && inQuiet(profile, r.at)))
            .sort((a, b) => a.at - b.at)
            .slice(0, 60)
            .map(({ key, at, title, body }) => ({ key, at, title, body })),
        );
      }

      // the Android app shows its own notifications (the alarms above)
      const systemToo =
        !app && !pushOnThisDevice() && 'Notification' in window && Notification.permission === 'granted';
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
    const timer = setInterval(check, 20_000);
    return () => clearInterval(timer);
  }, [events, sessions, taskById, gigs, profile, notify]);
}
