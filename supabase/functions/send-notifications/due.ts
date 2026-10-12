// Which notifications are due right now for one user. Pure logic, shared by the
// Edge Function (Deno) and the unit tests (Node). No imports on purpose.

export interface NotifyProfile {
  timezone: string;
  freelance_enabled: boolean;
  notify_events: boolean;
  notify_sessions: boolean;
  session_lead_minutes: number;
  notify_gigs: boolean;
  notify_deadlines: boolean;
  deadline_lead_hours: number;
  notify_summary: boolean;
  summary_time: string; // "HH:MM[:SS]"
  quiet_enabled: boolean;
  quiet_from: string;
  quiet_to: string;
}

export interface DueEvent {
  id: string;
  title: string;
  kind: string;
  starts_at: string;
  all_day: boolean;
  location: string | null;
  remind_minutes_before: number | null;
}
export interface DueSession {
  id: string;
  kind: string;
  task_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
}
export interface DueGig {
  id: string;
  title: string;
  mode: string;
  status: string;
  starts_at: string | null;
  location: string | null;
  prep_minutes: number;
  travel_minutes: number;
}
export interface DueTask {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
}

export type NoteKind = 'event' | 'session' | 'gig' | 'deadline' | 'summary';

export interface Note {
  key: string; // unique per occurrence, used to never send twice
  kind: NoteKind;
  title: string;
  body: string;
  url: string;
}

export interface DueInput {
  now: Date;
  profile: NotifyProfile;
  events: DueEvent[];
  sessions: DueSession[];
  gigs: DueGig[];
  tasks: DueTask[];
}

const MIN = 60_000;
/** how far back a missed notification is still worth sending (cron hiccups, cold starts) */
export const WINDOW_MS = 10 * MIN;

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Local wall-clock parts in the user's time zone. */
export function localParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: hour * 60 + Number(get('minute')) };
}

const hhmm = (d: Date, timeZone: string) => {
  const m = localParts(d, timeZone).minutes;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export function inQuietHours(now: Date, p: NotifyProfile) {
  if (!p.quiet_enabled) return false;
  const m = localParts(now, p.timezone).minutes;
  const from = toMinutes(p.quiet_from);
  const to = toMinutes(p.quiet_to);
  if (from === to) return false;
  return from < to ? m >= from && m < to : m >= from || m < to; // e.g. 22:00–07:00 wraps midnight
}

const due = (at: number, now: number) => at <= now && now - at < WINDOW_MS;

export function dueNotifications(input: DueInput): Note[] {
  const { now, profile: p } = input;
  const t = now.getTime();
  const tz = p.timezone;
  const notes: Note[] = [];
  const dayUrl = (iso: string) => `/?d=${localParts(new Date(iso), tz).date}&view=day`;

  if (p.notify_events) {
    for (const e of input.events) {
      if (e.remind_minutes_before === null) continue;
      const start = new Date(e.starts_at).getTime();
      if (!due(start - e.remind_minutes_before * MIN, t)) continue;
      const when = e.all_day ? 'Dnes' : hhmm(new Date(e.starts_at), tz);
      notes.push({
        key: `e:${e.id}:${e.starts_at}:${e.remind_minutes_before}`,
        kind: 'event',
        title: e.title,
        body: [e.kind === 'reminder' ? 'Pripomienka' : when, e.location].filter(Boolean).join(', '),
        url: dayUrl(e.starts_at),
      });
    }
  }

  if (p.notify_sessions) {
    const titles = new Map(input.tasks.map((x) => [x.id, x.title]));
    for (const s of input.sessions) {
      if (s.status !== 'planned') continue;
      if (!due(new Date(s.starts_at).getTime() - p.session_lead_minutes * MIN, t)) continue;
      const what = s.kind === 'leisure' ? 'Voľný čas' : (titles.get(s.task_id ?? '') ?? 'Blok práce');
      notes.push({
        key: `s:${s.id}:${s.starts_at}:${p.session_lead_minutes}`,
        kind: 'session',
        title: p.session_lead_minutes ? `O ${p.session_lead_minutes} min: ${what}` : `Teraz: ${what}`,
        body: `${hhmm(new Date(s.starts_at), tz)}–${hhmm(new Date(s.ends_at), tz)}`,
        url: dayUrl(s.starts_at),
      });
    }
  }

  if (p.notify_gigs && p.freelance_enabled) {
    for (const g of input.gigs) {
      if (g.mode !== 'event' || !g.starts_at || (g.status !== 'planned' && g.status !== 'confirmed')) continue;
      const before = g.prep_minutes + g.travel_minutes;
      if (!due(new Date(g.starts_at).getTime() - before * MIN, t)) continue;
      const start = hhmm(new Date(g.starts_at), tz);
      notes.push({
        key: `g:${g.id}:${g.starts_at}:${before}`,
        kind: 'gig',
        title: before ? `Čas vyraziť: ${g.title}` : g.title,
        body: [`začiatok o ${start}`, g.location].filter(Boolean).join(', '),
        url: '/freelance',
      });
    }
  }

  if (p.notify_deadlines) {
    for (const x of input.tasks) {
      if (x.status !== 'todo' || !x.deadline) continue;
      if (!due(new Date(x.deadline).getTime() - p.deadline_lead_hours * 60 * MIN, t)) continue;
      const lead = p.deadline_lead_hours;
      notes.push({
        key: `t:${x.id}:${x.deadline}:${lead}`,
        kind: 'deadline',
        title: `Termín o ${lead === 24 ? 'deň' : lead < 24 ? `${lead} h` : `${Math.round(lead / 24)} dni`}: ${x.title}`,
        body: `Do ${localParts(new Date(x.deadline), tz).date.split('-').reverse().slice(0, 2).join('. ')}. o ${hhmm(new Date(x.deadline), tz)}`,
        url: '/tasks',
      });
    }
  }

  if (p.notify_summary) {
    const local = localParts(now, tz);
    const at = toMinutes(p.summary_time);
    if (local.minutes >= at && local.minutes - at < WINDOW_MS / MIN) {
      const today = (iso: string) => localParts(new Date(iso), tz).date === local.date;
      const events = input.events.filter((e) => e.kind !== 'reminder' && today(e.starts_at)).length;
      const work = input.sessions.filter((s) => s.kind === 'task' && s.status === 'planned' && today(s.starts_at)).length;
      const deadlines = input.tasks.filter((x) => x.status === 'todo' && x.deadline && today(x.deadline)).length;
      const gigs = p.freelance_enabled
        ? input.gigs.filter((g) => g.mode === 'event' && g.starts_at && g.status !== 'cancelled' && today(g.starts_at)).length
        : 0;
      const parts = [
        events && `${events}× v kalendári`,
        work && `${work}× práca na úlohách`,
        gigs && `${gigs}× freelance`,
        deadlines && `${deadlines}× termín`,
      ].filter(Boolean);
      notes.push({
        key: `sum:${local.date}`,
        kind: 'summary',
        title: 'Dnešný deň',
        body: parts.length ? parts.join(', ') : 'Nič naplánované. Voľný deň.',
        url: '/',
      });
    }
  }

  // at night only what the user asked for explicitly gets through
  if (inQuietHours(now, p)) return notes.filter((n) => n.kind === 'event' || n.kind === 'gig');
  return notes;
}
