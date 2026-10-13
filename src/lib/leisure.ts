import { startOfDay } from 'date-fns';
import { fixedTime, leisureRule, placeLeisure, subtract, type Interval, type PlannerInput } from './planner';
import { MINUTE } from './time';
import type { LeisureWhen, RoutineBlock } from './types';

export const LEISURE_WHEN: { value: LeisureWhen; label: string; hint: string }[] = [
  { value: 'after_school', label: 'Po vyučovaní', hint: 'hneď po poslednej hodine alebo práci (aj s autobusom domov); bez školy večer' },
  { value: 'evening', label: 'Večer', hint: 'od 18:00, alebo čo najbližšie k tomu' },
  { value: 'before_sleep', label: 'Pred spaním', hint: 'na konci dňa' },
  { value: 'custom', label: 'Vlastný čas', hint: 'od času, ktorý si zvolíš' },
  { value: 'flexible', label: 'Podľa práce', hint: 'bez pevného času: práca sa naplánuje tak, aby medzi ňou ostali medzery spolu aspoň na tento čas' },
];

/** A faint area in the timetable: free time kept on purpose, or (flexible) a gap left between work. */
export interface LeisureBand {
  id: string;
  day: Date;
  start: Date;
  end: Date;
  /** a gap between work ('flexible'), not a chosen window */
  gap: boolean;
}

type BandInput = Pick<PlannerInput, 'profile' | 'routine' | 'events' | 'sessions' | 'gigs'>;

const MIN_GAP = 30;

/**
 * The free time to draw for the given days. Same rules as the planner, so the window shown is
 * where suggestions stay away from; pencil work that had to use it (a deadline) cuts it out.
 */
export function leisureBands(
  days: Date[],
  input: BandInput,
  opts: {
    now?: Date;
    routineOn?: (r: RoutineBlock, day: Date) => boolean;
    includePast?: boolean;
    /** 'flexible' has no fixed place: draw no gaps (the usual week, without any work in it) */
    noGaps?: boolean;
  } = {},
): LeisureBand[] {
  const now = opts.now ?? new Date();
  const today = startOfDay(now).getTime();
  const out: LeisureBand[] = [];
  const work = input.sessions
    .filter((s) => s.kind === 'task' && s.status !== 'skipped')
    .map((s) => ({ start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() }));
  const pencil = input.sessions
    .filter((s) => s.status === 'suggested' && s.kind === 'task')
    .map((s) => ({
      start: new Date(s.starts_at).getTime(),
      end: new Date(s.ends_at).getTime() + input.profile.break_minutes * MINUTE,
    }));

  for (const day of days) {
    if (!opts.includePast && startOfDay(day).getTime() < today) continue;
    const rule = leisureRule(input.profile, day);
    if (rule.when === 'off') continue;
    const routineOn = opts.routineOn;
    const fixed = fixedTime(day, input, routineOn ? (r) => routineOn(r, day) : undefined);
    const need = rule.minutes - fixed.leisureHad;
    if (need < 15) continue;

    let pieces: Interval[];
    if (rule.when === 'flexible') {
      // a day without work is free anyway; the gaps only mean something around work
      if (opts.noGaps || !work.some((w) => w.start < fixed.dayEnd && w.end > fixed.dayStart)) continue;
      const from = Math.max(fixed.dayStart, startOfDay(day).getTime() === today ? now.getTime() : 0);
      pieces = from < fixed.dayEnd ? [{ start: Math.ceil(from / (5 * MINUTE)) * 5 * MINUTE, end: fixed.dayEnd }] : [];
      for (const iv of [...fixed.busy, ...pencil]) pieces = subtract(pieces, iv);
      pieces = pieces.filter((iv) => iv.end - iv.start >= MIN_GAP * MINUTE);
    } else {
      pieces = placeLeisure(rule.when, rule.start, need, fixed);
      for (const iv of pencil) pieces = subtract(pieces, iv);
      pieces = pieces.filter((iv) => iv.end - iv.start >= 10 * MINUTE);
    }
    for (const iv of pieces) {
      out.push({
        id: `l-${iv.start}`,
        day,
        start: new Date(iv.start),
        end: new Date(iv.end),
        gap: rule.when === 'flexible',
      });
    }
  }
  return out;
}
