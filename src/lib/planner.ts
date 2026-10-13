import { addDays, startOfDay } from 'date-fns';
import type { CalendarEvent, Gig, LeisureDay, LeisureWhen, Profile, RoutineBlock, Session, Task } from './types';
import { gigBusy } from './freelance';
import { DAY, MINUTE, atMinutes, isoWeekday, timeToMinutes, toDateInput, weekParity } from './time';

/**
 * Planner: turns the regular week, one-off events and already planned sessions
 * into free time, then fills that free time with work on open tasks.
 *
 * Rules, in order of importance:
 *  1. Never overlap anything busy (classes, commute, events, planned sessions).
 *  2. Work happens only between day_start and day_end and never after a task's deadline.
 *  3. Daily focus time is capped (max_focus_minutes_per_day); every block is followed by a break.
 *  4. Each day keeps its free time where the user wants it (after school, evening, before
 *     sleep, a set time, or anywhere around the work). It is not a block in the calendar,
 *     just a window left empty; work goes there only when a deadline would be missed.
 *  5. Urgent (close deadline) and important (high priority) tasks get the earliest slots;
 *     tasks with distant deadlines are spread out (max 2 blocks per task per day).
 */

export type PlannerProfile = Pick<
  Profile,
  | 'day_start'
  | 'day_end'
  | 'focus_block_minutes'
  | 'break_minutes'
  | 'max_focus_minutes_per_day'
  | 'leisure_minutes_per_day'
  | 'planning_horizon_days'
  | 'odd_week_anchor'
> &
  Partial<Pick<Profile, 'leisure_when' | 'leisure_start' | 'leisure_days'>>;

export interface PlannerInput {
  now: Date;
  profile: PlannerProfile;
  routine: RoutineBlock[];
  events: CalendarEvent[];
  sessions: Session[];
  tasks: Task[];
  /** freelance gigs: event gigs (with preparation and travel) are busy time */
  gigs?: Gig[];
}

export interface Suggestion {
  kind: 'task';
  taskId: string | null;
  start: Date;
  end: Date;
}

export interface PlannerWarning {
  taskId: string;
  missingMinutes: number;
  reason: 'deadline' | 'overdue' | 'horizon';
}

export interface PlannerResult {
  suggestions: Suggestion[];
  warnings: PlannerWarning[];
}

export interface Interval {
  start: number;
  end: number;
}

interface DayState {
  windowStart: number;
  windowEnd: number;
  free: Interval[];
  leisure: Interval[];
  /** 'flexible' free time: minutes that must stay free somewhere in the day */
  keepFree: number;
  focusUsed: number;
  chunksPerTask: Map<string, number>;
}

const STEP = 5 * MINUTE;
const MIN_CHUNK = 30; // shortest useful work block
const MIN_LEISURE = 15;
const EVENING = 18 * 60;
const MAX_CHUNKS_PER_DAY = 2;

const ceilStep = (t: number) => Math.ceil(t / STEP) * STEP;
const minutes = (iv: Interval) => (iv.end - iv.start) / MINUTE;

export function subtract(free: Interval[], busy: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of free) {
    if (busy.end <= iv.start || busy.start >= iv.end) {
      out.push(iv);
      continue;
    }
    if (busy.start > iv.start) out.push({ start: iv.start, end: busy.start });
    if (busy.end < iv.end) out.push({ start: busy.end, end: iv.end });
  }
  return out;
}

function overlapMinutes(a: Interval, b: Interval) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / MINUTE;
}

export function routineAppliesOn(block: RoutineBlock, day: Date, oddAnchor: string): boolean {
  if (!block.weekdays.includes(isoWeekday(day))) return false;
  if (block.week_parity !== 'all' && weekParity(day, oddAnchor) !== block.week_parity) return false;
  const d = toDateInput(day);
  if (block.valid_from && d < block.valid_from) return false;
  if (block.valid_until && d > block.valid_until) return false;
  return true;
}

export function eventInterval(e: CalendarEvent): Interval {
  const start = new Date(e.starts_at);
  if (e.all_day) {
    const s = startOfDay(start).getTime();
    const endDay = e.ends_at ? startOfDay(new Date(e.ends_at)).getTime() : s;
    return { start: s, end: Math.max(endDay, s) + DAY };
  }
  const end = e.ends_at ? new Date(e.ends_at).getTime() : start.getTime() + 30 * MINUTE;
  return { start: start.getTime(), end };
}

export function sessionMinutes(s: Session) {
  return (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / MINUTE;
}

/** Minutes of a task that are already done or planned (and so need no new suggestion). */
export function coveredMinutes(taskId: string, sessions: Session[]) {
  return sessions
    .filter((s) => s.task_id === taskId && (s.status === 'done' || s.status === 'planned'))
    .reduce((sum, s) => sum + sessionMinutes(s), 0);
}

export function doneMinutes(taskId: string, sessions: Session[]) {
  return sessions
    .filter((s) => s.task_id === taskId && s.status === 'done')
    .reduce((sum, s) => sum + sessionMinutes(s), 0);
}

/** Higher = schedule earlier. Deadline urgency dominates when it is close. */
export function taskScore(task: Task, now: Date): number {
  const importance = task.priority * 10;
  if (!task.deadline) return importance;
  const daysLeft = (new Date(task.deadline).getTime() - now.getTime()) / DAY;
  return importance + 100 / Math.max(daysLeft, 0.25);
}

export function plan(input: PlannerInput): PlannerResult {
  const { now, profile } = input;
  const nowMs = ceilStep(now.getTime());
  const active = input.sessions.filter((s) => s.status === 'planned' || s.status === 'done');

  // 1) free time per day, minus the free-time window the user wants kept
  const days: DayState[] = [];
  for (let i = 0; i < profile.planning_horizon_days; i++) {
    const date = addDays(startOfDay(now), i);
    const fixed = fixedTime(date, input);
    const windowStart = Math.max(fixed.dayStart, nowMs);
    const windowEnd = fixed.dayEnd;
    const state: DayState = {
      windowStart,
      windowEnd,
      free: windowEnd > windowStart ? [{ start: windowStart, end: windowEnd }] : [],
      leisure: [],
      keepFree: 0,
      focusUsed: 0,
      chunksPerTask: new Map(),
    };
    for (const iv of fixed.busy) state.free = subtract(state.free, iv);
    state.free = state.free.filter((iv) => minutes(iv) >= 5);

    const dayInterval = { start: fixed.dayStart, end: fixed.dayEnd };
    for (const s of active) {
      if (s.kind !== 'task') continue;
      const inDay = overlapMinutes({ start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() }, dayInterval);
      state.focusUsed += inDay;
      if (s.task_id && inDay > 0) state.chunksPerTask.set(s.task_id, (state.chunksPerTask.get(s.task_id) ?? 0) + 1);
    }

    // 2) keep the free time
    const rule = leisureRule(profile, date);
    const need = rule.minutes - fixed.leisureHad;
    if (rule.when !== 'off' && need >= MIN_LEISURE) {
      if (rule.when === 'flexible') state.keepFree = need;
      else {
        for (const w of placeLeisure(rule.when, rule.start, need, fixed)) {
          state.leisure.push(...intersect(state.free, w));
          state.free = subtract(state.free, w).filter((iv) => minutes(iv) >= 5);
        }
      }
    }

    days.push(state);
  }

  // 3) tasks, most urgent/important first
  const queue = input.tasks
    .filter((t) => t.status === 'todo')
    .map((t) => ({
      task: t,
      remaining: t.estimated_minutes - coveredMinutes(t.id, input.sessions),
      score: taskScore(t, now),
    }))
    .filter((q) => q.remaining >= 5)
    .sort((a, b) => b.score - a.score);

  const suggestions: Suggestion[] = [];
  const warnings: PlannerWarning[] = [];

  for (const q of queue) {
    const deadlineMs = q.task.deadline ? new Date(q.task.deadline).getTime() : null;
    const overdue = deadlineMs !== null && deadlineMs <= nowMs;
    const limit = overdue ? null : deadlineMs;
    const urgent = limit !== null && limit - nowMs < 2 * DAY;

    q.remaining = placeTask(q.task.id, q.remaining, limit, urgent, days, 'free', true, profile, suggestions);
    // a real deadline is at stake: first drop the spreading rule, only then give up free time
    if (q.remaining > 0 && limit !== null) {
      q.remaining = placeTask(q.task.id, q.remaining, limit, true, days, 'free', true, profile, suggestions);
    }
    if (q.remaining > 0 && limit !== null) {
      q.remaining = placeTask(q.task.id, q.remaining, limit, true, days, 'free', false, profile, suggestions);
      q.remaining = placeTask(q.task.id, q.remaining, limit, true, days, 'leisure', false, profile, suggestions);
    }
    if (q.remaining > 0) {
      warnings.push({
        taskId: q.task.id,
        missingMinutes: Math.round(q.remaining),
        reason: overdue ? 'overdue' : limit !== null ? 'deadline' : 'horizon',
      });
    }
  }

  suggestions.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { suggestions, warnings };
}

/** What the user asked for on this day: when and how much free time. */
export function leisureRule(
  profile: PlannerProfile,
  day: Date,
): { when: LeisureWhen | 'off'; start: string | null; minutes: number } {
  const mode = profile.leisure_when ?? 'before_sleep';
  if (mode === 'per_day') {
    const d: LeisureDay | undefined = profile.leisure_days?.[isoWeekday(day) - 1];
    if (d) return { when: d.when, start: d.start, minutes: d.minutes };
    return { when: 'evening', start: null, minutes: profile.leisure_minutes_per_day };
  }
  return { when: mode, start: profile.leisure_start ?? null, minutes: profile.leisure_minutes_per_day };
}

export interface FixedDay {
  dayStart: number;
  dayEnd: number;
  /** everything already taken: routine, events, gigs, accepted work (with its break) */
  busy: Interval[];
  /** free time the user put in the calendar by hand (routine or events of kind leisure) */
  leisureHad: number;
  /** end of school or work, including the trip home right after it */
  schoolEnd: number | null;
}

type FixedInput = Pick<PlannerInput, 'profile' | 'routine' | 'events' | 'sessions' | 'gigs'>;

/** The fixed part of one day, the same for the planner and for drawing the free-time window. */
export function fixedTime(date: Date, input: FixedInput, routineOn?: (r: RoutineBlock) => boolean): FixedDay {
  const { profile } = input;
  const dayStart = atMinutes(date, timeToMinutes(profile.day_start)).getTime();
  const dayEnd = atMinutes(date, timeToMinutes(profile.day_end)).getTime();
  const dayInterval = { start: dayStart, end: dayEnd };
  const applies = routineOn ?? ((r: RoutineBlock) => routineAppliesOn(r, date, profile.odd_week_anchor));
  const busy: Interval[] = [];
  let leisureHad = 0;
  let schoolEnd: number | null = null;

  for (const r of input.routine) {
    if (!applies(r)) continue;
    const iv = {
      start: atMinutes(date, timeToMinutes(r.start_time)).getTime(),
      end: atMinutes(date, timeToMinutes(r.end_time)).getTime(),
    };
    busy.push(iv);
    if (r.kind === 'leisure') leisureHad += overlapMinutes(iv, dayInterval);
    if (r.kind === 'class' || r.kind === 'work') schoolEnd = Math.max(schoolEnd ?? 0, iv.end);
  }
  const commutes: Interval[] = [];
  for (const e of input.events) {
    if (!e.blocks_planning || e.kind === 'reminder') continue;
    const iv = eventInterval(e);
    busy.push(iv);
    if (e.kind === 'leisure') leisureHad += overlapMinutes(iv, dayInterval);
    if (e.kind === 'commute' && !e.all_day) commutes.push(iv);
  }
  for (const g of input.gigs ?? []) {
    const iv = gigBusy(g);
    if (iv) busy.push(iv);
  }
  for (const s of input.sessions) {
    if (s.status !== 'planned' && s.status !== 'done') continue;
    const iv = { start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() };
    if (s.kind === 'leisure') leisureHad += overlapMinutes(iv, dayInterval);
    // work blocks already in the plan get their break too, like the ones the planner places
    busy.push(s.kind === 'task' ? { start: iv.start, end: iv.end + profile.break_minutes * MINUTE } : iv);
  }
  // the bus home right after school still belongs to school
  if (schoolEnd !== null) {
    for (const c of commutes.sort((a, b) => a.start - b.start)) {
      if (c.start >= schoolEnd - 15 * MINUTE && c.start <= schoolEnd + 90 * MINUTE) schoolEnd = Math.max(schoolEnd, c.end);
    }
  }
  return { dayStart, dayEnd, busy, leisureHad, schoolEnd };
}

/**
 * Where the free time goes on a day: as close to the wanted time as the day allows,
 * in one piece if possible. 'after_school' falls back to the evening on days without school.
 */
export function placeLeisure(
  when: Exclude<LeisureWhen, 'flexible'>,
  start: string | null,
  need: number,
  fixed: FixedDay,
): Interval[] {
  let free: Interval[] = [{ start: fixed.dayStart, end: fixed.dayEnd }];
  for (const iv of fixed.busy) free = subtract(free, iv);
  free = free.map((iv) => ({ start: ceilStep(iv.start), end: iv.end })).filter((iv) => minutes(iv) >= MIN_LEISURE);
  if (!free.length) return [];

  const day = new Date(fixed.dayStart);
  const len = need * MINUTE;
  const target =
    when === 'before_sleep'
      ? fixed.dayEnd - len
      : when === 'custom' && start
        ? atMinutes(day, timeToMinutes(start)).getTime()
        : when === 'after_school' && fixed.schoolEnd !== null
          ? fixed.schoolEnd
          : atMinutes(day, EVENING).getTime();

  // later than wanted beats earlier (an hour off before the last class is no free time)
  const cost = (s: number) => (s >= target ? s - target : 2 * (target - s));
  let best: Interval | null = null;
  for (const iv of free) {
    if (iv.end - iv.start < len) continue;
    const s = when === 'before_sleep' ? iv.end - len : Math.min(Math.max(target, iv.start), iv.end - len);
    if (!best || cost(s) < cost(best.start)) best = { start: s, end: s + len };
  }
  if (best) return [best];

  // no gap is long enough: the closest pieces
  const out: Interval[] = [];
  let left = len;
  const near = (iv: Interval) => Math.min(Math.abs(iv.start - target), Math.abs(iv.end - target));
  for (const iv of [...free].sort((a, b) => near(a) - near(b))) {
    if (left < MIN_LEISURE * MINUTE) break;
    const take = Math.min(left, iv.end - iv.start);
    const s = iv.start >= target ? iv.start : iv.end <= target ? iv.end - take : Math.max(iv.start, Math.min(target, iv.end - take));
    out.push({ start: s, end: s + take });
    left -= take;
  }
  return out.sort((a, b) => a.start - b.start);
}

function intersect(pool: Interval[], w: Interval): Interval[] {
  return pool
    .map((iv) => ({ start: Math.max(iv.start, w.start), end: Math.min(iv.end, w.end) }))
    .filter((iv) => iv.end > iv.start);
}

function placeTask(
  taskId: string,
  remaining: number,
  deadlineMs: number | null,
  urgent: boolean,
  days: DayState[],
  pool: 'free' | 'leisure',
  keepFree: boolean,
  profile: PlannerProfile,
  out: Suggestion[],
): number {
  const maxChunks = urgent ? Infinity : MAX_CHUNKS_PER_DAY;

  for (const day of days) {
    if (remaining <= 0) break;
    if (deadlineMs !== null && day.windowStart >= deadlineMs) break;

    while (remaining > 0 && (day.chunksPerTask.get(taskId) ?? 0) < maxChunks) {
      // 'flexible' free time: leave enough of the day's gaps untouched
      const spare =
        keepFree && day.keepFree > 0
          ? day.free.reduce((m, iv) => m + minutes(iv), 0) - day.keepFree - profile.break_minutes
          : Infinity;
      const cap = Math.min(profile.max_focus_minutes_per_day - day.focusUsed, spare);
      const minLen = Math.min(MIN_CHUNK, remaining);
      if (cap < minLen) break;

      const slot = firstSlot(day[pool], minLen, deadlineMs);
      if (!slot) break;

      const limit = Math.min(slot.maxLen, cap);
      let len = Math.min(profile.focus_block_minutes, remaining, limit);
      const leftover = remaining - len;
      // don't leave a crumb smaller than one block behind
      if (leftover > 0 && leftover < MIN_CHUNK && len + leftover <= limit) len += leftover;
      len = Math.max(minLen, Math.floor(len / 5) * 5);
      if (len > limit) break;

      const start = slot.start;
      const end = start + len * MINUTE;
      out.push({ kind: 'task', taskId, start: new Date(start), end: new Date(end) });
      day[pool] = subtract(day[pool], { start, end: end + profile.break_minutes * MINUTE }).filter(
        (iv) => minutes(iv) >= 5,
      );
      day.focusUsed += len;
      day.chunksPerTask.set(taskId, (day.chunksPerTask.get(taskId) ?? 0) + 1);
      remaining -= len;
    }
  }
  return remaining;
}

function firstSlot(pool: Interval[], minLen: number, deadlineMs: number | null) {
  const sorted = [...pool].sort((a, b) => a.start - b.start);
  for (const iv of sorted) {
    const start = ceilStep(iv.start);
    const end = deadlineMs === null ? iv.end : Math.min(iv.end, deadlineMs);
    const len = Math.floor((end - start) / MINUTE);
    if (len >= minLen) return { start, maxLen: len };
  }
  return null;
}

/**
 * Pencil blocks for `minutes` more work on one task, fitted around everything already
 * in the calendar, other pencil suggestions included (they stay as they are).
 * Used after a block ends: "not done at all" or "done, but it needs more time".
 */
export function planFollowUp(input: PlannerInput, taskId: string, minutes: number): PlannerResult {
  const task = input.tasks.find((t) => t.id === taskId);
  if (!task || minutes < 5) return { suggestions: [], warnings: [] };
  const sessions = input.sessions.map((s) => (s.status === 'suggested' ? { ...s, status: 'planned' as const } : s));
  const target: Task = { ...task, status: 'todo', estimated_minutes: coveredMinutes(taskId, sessions) + minutes };
  const result = plan({ ...input, sessions, tasks: [target] });
  return { suggestions: result.suggestions.filter((s) => s.kind === 'task'), warnings: result.warnings };
}
