import { addDays, startOfDay } from 'date-fns';
import { routineAppliesOn } from './planner';
import { atMinutes, fmtDuration, fmtTime, MINUTE, timeToMinutes } from './time';
import { t } from './i18n';
import type { CalendarEvent, FreeBlock, Gig, Gender, RoutineBlock, Session, Task } from './types';

export type NowKind = 'work' | 'school' | 'job' | 'commute' | 'event' | 'gig' | 'free' | 'other';

export interface NowItem {
  kind: NowKind;
  title: string;
  start: Date;
  end: Date;
  /** gigs: when to leave (preparation and travel before the start) */
  leaveAt?: Date;
  color?: string;
  ref: { type: 'session'; item: Session } | { type: 'event'; item: CalendarEvent } | { type: 'routine'; item: RoutineBlock } | { type: 'gig'; item: Gig } | { type: 'free'; item: FreeBlock };
}

export interface NowInput {
  now: Date;
  oddAnchor: string;
  routine: RoutineBlock[];
  events: CalendarEvent[];
  sessions: Session[];
  tasks: Task[];
  gigs: Gig[];
  freeBlocks: FreeBlock[];
}

/** what matters more when two things overlap */
const RANK: Record<NowKind, number> = { work: 0, gig: 1, event: 2, school: 3, job: 3, commute: 4, other: 5, free: 6 };

/** Everything with a time today (and tomorrow, so the evening still shows what comes next). */
export function dayItems(input: NowInput): NowItem[] {
  const out: NowItem[] = [];
  const today = startOfDay(input.now);
  const until = addDays(today, 2).getTime();
  const inRange = (s: Date, e: Date) => e.getTime() > today.getTime() && s.getTime() < until;

  for (const day of [today, addDays(today, 1)]) {
    for (const r of input.routine) {
      if (!routineAppliesOn(r, day, input.oddAnchor) || r.kind === 'leisure') continue;
      out.push({
        kind: r.kind === 'class' ? 'school' : r.kind === 'work' ? 'job' : 'other',
        title: r.title,
        start: atMinutes(day, timeToMinutes(r.start_time)),
        end: atMinutes(day, timeToMinutes(r.end_time)),
        color: r.color ?? undefined,
        ref: { type: 'routine', item: r },
      });
    }
  }
  for (const e of input.events) {
    if (e.all_day || e.kind === 'reminder' || !e.ends_at) continue;
    const s = new Date(e.starts_at);
    const end = new Date(e.ends_at);
    if (!inRange(s, end)) continue;
    out.push({ kind: e.kind === 'commute' ? 'commute' : 'event', title: e.title, start: s, end, color: e.color ?? undefined, ref: { type: 'event', item: e } });
  }
  const titles = new Map(input.tasks.map((task) => [task.id, task.title]));
  for (const s of input.sessions) {
    if (s.kind !== 'task' || s.status !== 'planned') continue;
    const start = new Date(s.starts_at);
    const end = new Date(s.ends_at);
    if (!inRange(start, end)) continue;
    out.push({ kind: 'work', title: titles.get(s.task_id ?? '') ?? t('Práca na úlohe'), start, end, ref: { type: 'session', item: s } });
  }
  for (const g of input.gigs) {
    if (g.mode !== 'event' || !g.starts_at || !g.ends_at || g.status === 'cancelled') continue;
    const start = new Date(g.starts_at);
    const end = new Date(g.ends_at);
    if (!inRange(start, end)) continue;
    const before = g.prep_minutes + g.travel_minutes;
    out.push({
      kind: 'gig',
      title: g.title,
      start,
      end,
      leaveAt: before ? new Date(start.getTime() - before * MINUTE) : undefined,
      ref: { type: 'gig', item: g },
    });
  }
  for (const f of input.freeBlocks) {
    const start = new Date(f.starts_at);
    const end = new Date(f.ends_at);
    if (!inRange(start, end)) continue;
    out.push({ kind: 'free', title: f.note || t('Vyhradené voľno'), start, end, ref: { type: 'free', item: f } });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || RANK[a.kind] - RANK[b.kind]);
}

export interface NowState {
  current: NowItem | null;
  next: NowItem | null;
}

/** What is going on right now, and what comes next (a gig counts from the moment to leave). */
export function nowAndNext(input: NowInput): NowState {
  const ms = input.now.getTime();
  const items = dayItems(input);
  const current =
    items
      .filter((i) => i.start.getTime() <= ms && ms < i.end.getTime())
      .sort((a, b) => RANK[a.kind] - RANK[b.kind])[0] ?? null;
  const next =
    items
      .filter((i) => i !== current && (i.leaveAt ?? i.start).getTime() > ms)
      // not something that merely continues what's on now
      .filter((i) => !current || i.start.getTime() >= current.start.getTime())
      .sort((a, b) => (a.leaveAt ?? a.start).getTime() - (b.leaveAt ?? b.start).getTime() || RANK[a.kind] - RANK[b.kind])[0] ?? null;
  return { current, next };
}

const g = (gender: Gender | null | undefined, m: string, f: string) => t(gender === 'f' ? f : m);

/** "35 min", "1 h 20 min" */
const left = (ms: number) => fmtDuration(Math.max(1, Math.round(ms / MINUTE)));

export interface Line {
  lead: string; // "Práve máš na práci"
  title: string; // "Fyzika príklady"
  detail: string; // "do 16:15 · ešte 35 min"
}

export function currentLine(i: NowItem | null, now: Date, gender: Gender | null | undefined): Line {
  if (!i) return { lead: g(gender, 'Teraz si voľný', 'Teraz si voľná'), title: '', detail: t('nič práve neprebieha') };
  const rest = t('do {time} · ešte {left}', { time: fmtTime(i.end), left: left(i.end.getTime() - now.getTime()) });
  const lead: Record<NowKind, string> = {
    work: 'Práve máš na práci',
    school: 'Práve prebieha',
    job: 'Práve si v práci',
    commute: 'Práve cestuješ',
    event: 'Práve prebieha',
    gig: 'Práve si na akcii',
    free: 'Práve máš voľno',
    other: 'Práve máš',
  };
  return { lead: t(lead[i.kind]), title: i.title, detail: rest };
}

export function nextLine(i: NowItem | null, now: Date): Line | null {
  if (!i) return null;
  const at = i.leaveAt ?? i.start;
  const diff = at.getTime() - now.getTime();
  const tomorrow = startOfDay(at).getTime() !== startOfDay(now).getTime();
  // close: "O 25 min", later today: "O 15:25", tomorrow: "Zajtra o 8:00"
  const when = tomorrow
    ? t('Zajtra o {time}', { time: fmtTime(at) })
    : diff <= 120 * MINUTE
      ? t('O {left}', { left: left(diff) })
      : t('O {time}', { time: fmtTime(at) });
  const span = `${fmtTime(i.start)}–${fmtTime(i.end)}`;
  switch (i.kind) {
    case 'work':
      return { lead: t('{when} začínaš', { when }), title: i.title, detail: span };
    case 'school':
    case 'job':
    case 'other':
      return { lead: t('{when} ti začína', { when }), title: i.title, detail: span };
    case 'commute':
      return { lead: t('{when} ti ide', { when }), title: i.title, detail: span };
    case 'gig':
      return i.leaveAt
        ? { lead: t('{when} treba vyraziť na', { when }), title: i.title, detail: t('začiatok o {time}', { time: fmtTime(i.start) }) }
        : { lead: t('{when} začína akcia', { when }), title: i.title, detail: span };
    case 'free':
      // drawn without a note: "máš voľno" says it all
      return { lead: t('{when} máš voľno', { when }), title: i.ref.type === 'free' && !i.ref.item.note ? '' : i.title, detail: span };
    default:
      return { lead: t('{when} máš', { when }), title: i.title, detail: span };
  }
}
