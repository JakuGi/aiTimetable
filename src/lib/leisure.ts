import { startOfDay } from 'date-fns';
import { fixedTime, subtract, type Interval, type PlannerInput } from './planner';
import { MINUTE } from './time';

/** the free-time green, for blocks drawn by hand (matches --leisure) */
export const LEISURE_GREEN = '#2F9E6E';

/** A faint area in the timetable: a gap the planner leaves free between work. */
export interface LeisureBand {
  id: string;
  day: Date;
  start: Date;
  end: Date;
}

type BandInput = Pick<PlannerInput, 'profile' | 'routine' | 'events' | 'sessions' | 'gigs' | 'freeBlocks'>;

const MIN_GAP = 30;

/**
 * The gaps between work to draw for the given days, on days that keep free time between work.
 * Free time drawn by hand is shown by itself (FreeBlock), so it is not a band.
 */
export function leisureBands(days: Date[], input: BandInput, opts: { now?: Date; includePast?: boolean } = {}): LeisureBand[] {
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
    const fixed = fixedTime(day, input);
    if (input.profile.leisure_minutes_per_day - fixed.leisureHad < 15) continue;
    // a day without work is free anyway; the gaps only mean something around work
    if (!work.some((w) => w.start < fixed.dayEnd && w.end > fixed.dayStart)) continue;

    const from = Math.max(fixed.dayStart, startOfDay(day).getTime() === today ? now.getTime() : 0);
    let pieces: Interval[] = from < fixed.dayEnd ? [{ start: Math.ceil(from / (5 * MINUTE)) * 5 * MINUTE, end: fixed.dayEnd }] : [];
    for (const iv of [...fixed.busy, ...fixed.reserved, ...pencil]) pieces = subtract(pieces, iv);
    for (const iv of pieces.filter((p) => p.end - p.start >= MIN_GAP * MINUTE)) {
      out.push({ id: `l-${iv.start}`, day, start: new Date(iv.start), end: new Date(iv.end) });
    }
  }
  return out;
}
