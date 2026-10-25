import { addDays, startOfDay } from 'date-fns';
import type { CalendarEvent, FreeBlock, Gig, Profile, RoutineBlock, RoutineSkip, Session, Task } from './types';
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
 *  4. Free time is what the user draws by hand (kept empty, given up last and only for a
 *     deadline), plus gaps left between the work: each day with work keeps free minutes
 *     somewhere (leisure_minutes_per_day, less what was drawn or put in the calendar).
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
>;

export interface PlannerInput {
  now: Date;
  profile: PlannerProfile;
  routine: RoutineBlock[];
  events: CalendarEvent[];
  sessions: Session[];
  tasks: Task[];
  /** freelance gigs: event gigs (with preparation and travel) are busy time */
  gigs?: Gig[];
  /** free time drawn by hand: kept empty, given up last and only for a deadline */
  freeBlocks?: Pick<FreeBlock, 'starts_at' | 'ends_at'>[];
  /** regular blocks cancelled on a day, or whole days off: that time is free */
  skips?: Pick<RoutineSkip, 'routine_block_id' | 'day'>[];
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
  /** work that had to go into free time the user reserved by hand */
  intrusions: Suggestion[];
}

export interface Interval {
  start: number;
  end: number;
}

interface DayState {
  windowStart: number;
  windowEnd: number;
  free: Interval[];
  /** drawn by hand, taken last */
  reserved: Interval[];
  /** free time between work: minutes that must stay free somewhere in the day */
  keepFree: number;
  focusUsed: number;
  chunksPerTask: Map<string, number>;
}

const STEP = 5 * MINUTE;
const MIN_CHUNK = 30; // shortest useful work block
const MIN_LEISURE = 15;
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

/** Cancelled that day: the block itself, or the whole day is a holiday. */
export function routineSkipped(block: RoutineBlock, day: Date, skips: PlannerInput['skips'] = []): boolean {
  const d = toDateInput(day);
  return skips.some((s) => s.day === d && (s.routine_block_id === null || s.routine_block_id === block.id));
}

/** The whole day is off (holiday, school break). */
export const isDayOff = (day: Date, skips: PlannerInput['skips'] = []) =>
  skips.some((s) => s.routine_block_id === null && s.day === toDateInput(day));

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

  // 1) free time per day, minus the free time drawn by hand
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
      reserved: [],
      keepFree: 0,
      focusUsed: 0,
      chunksPerTask: new Map(),
    };
    for (const iv of fixed.busy) state.free = subtract(state.free, iv);
    for (const r of fixed.reserved) {
      state.reserved.push(...intersect(state.free, r));
      state.free = subtract(state.free, r);
    }
    state.free = state.free.filter((iv) => minutes(iv) >= 5);

    const dayInterval = { start: fixed.dayStart, end: fixed.dayEnd };
    for (const s of active) {
      if (s.kind !== 'task') continue;
      const inDay = overlapMinutes({ start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() }, dayInterval);
      state.focusUsed += inDay;
      if (s.task_id && inDay > 0) state.chunksPerTask.set(s.task_id, (state.chunksPerTask.get(s.task_id) ?? 0) + 1);
    }

    // 2) free time between the work
    const need = profile.leisure_minutes_per_day - fixed.leisureHad;
    if (need >= MIN_LEISURE) state.keepFree = need;

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
  const intrusions: Suggestion[] = [];

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
    }
    // the very last resort: free time the user reserved by hand
    if (q.remaining > 0 && limit !== null) {
      const before = suggestions.length;
      q.remaining = placeTask(q.task.id, q.remaining, limit, true, days, 'reserved', false, profile, suggestions);
      intrusions.push(...suggestions.slice(before));
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
  return { suggestions, warnings, intrusions };
}

export interface FixedDay {
  dayStart: number;
  dayEnd: number;
  /** everything already taken: routine, events, gigs, accepted work (with its break) */
  busy: Interval[];
  /** free time the user put in the calendar by hand (drawn, or routine and events of kind leisure) */
  leisureHad: number;
  /** free time drawn by hand on this day */
  reserved: Interval[];
}

type FixedInput = Pick<PlannerInput, 'profile' | 'routine' | 'events' | 'sessions' | 'gigs' | 'freeBlocks' | 'skips'>;

/** The fixed part of one day, the same for the planner and for drawing the free-time window. */
export function fixedTime(date: Date, input: FixedInput, routineOn?: (r: RoutineBlock) => boolean): FixedDay {
  const { profile } = input;
  const dayStart = atMinutes(date, timeToMinutes(profile.day_start)).getTime();
  const dayEnd = atMinutes(date, timeToMinutes(profile.day_end)).getTime();
  const dayInterval = { start: dayStart, end: dayEnd };
  const applies =
    routineOn ??
    ((r: RoutineBlock) => routineAppliesOn(r, date, profile.odd_week_anchor) && !routineSkipped(r, date, input.skips));
  const busy: Interval[] = [];
  let leisureHad = 0;

  for (const r of input.routine) {
    if (!applies(r)) continue;
    const iv = {
      start: atMinutes(date, timeToMinutes(r.start_time)).getTime(),
      end: atMinutes(date, timeToMinutes(r.end_time)).getTime(),
    };
    busy.push(iv);
    if (r.kind === 'leisure') leisureHad += overlapMinutes(iv, dayInterval);
  }
  for (const e of input.events) {
    if (!e.blocks_planning || e.kind === 'reminder') continue;
    const iv = eventInterval(e);
    busy.push(iv);
    if (e.kind === 'leisure') leisureHad += overlapMinutes(iv, dayInterval);
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
  const reserved: Interval[] = [];
  for (const f of input.freeBlocks ?? []) {
    const iv = { start: new Date(f.starts_at).getTime(), end: new Date(f.ends_at).getTime() };
    if (iv.end <= dayStart || iv.start >= dayEnd) continue;
    reserved.push(iv);
    leisureHad += overlapMinutes(iv, dayInterval);
  }
  return { dayStart, dayEnd, busy, leisureHad, reserved };
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
  pool: 'free' | 'reserved',
  keepFree: boolean,
  profile: PlannerProfile,
  out: Suggestion[],
): number {
  const maxChunks = urgent ? Infinity : MAX_CHUNKS_PER_DAY;

  for (const day of days) {
    if (remaining <= 0) break;
    if (deadlineMs !== null && day.windowStart >= deadlineMs) break;

    while (remaining > 0 && (day.chunksPerTask.get(taskId) ?? 0) < maxChunks) {
      // free time between work: leave enough of the day's gaps untouched
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
  if (!task || minutes < 5) return { suggestions: [], warnings: [], intrusions: [] };
  const sessions = input.sessions.map((s) => (s.status === 'suggested' ? { ...s, status: 'planned' as const } : s));
  const target: Task = { ...task, status: 'todo', estimated_minutes: coveredMinutes(taskId, sessions) + minutes };
  const result = plan({ ...input, sessions, tasks: [target] });
  return result;
}
