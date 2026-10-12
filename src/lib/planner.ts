import { addDays, startOfDay } from 'date-fns';
import type { CalendarEvent, Gig, Profile, RoutineBlock, Session, Task } from './types';
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
 *  4. Each day keeps leisure time in the evening; it is given up only for tasks that
 *     would otherwise miss their deadline.
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
}

export interface Suggestion {
  kind: 'task' | 'leisure';
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

interface Interval {
  start: number;
  end: number;
}

interface DayState {
  windowStart: number;
  windowEnd: number;
  free: Interval[];
  leisure: Interval[];
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
  const dayStartMin = timeToMinutes(profile.day_start);
  const dayEndMin = timeToMinutes(profile.day_end);
  const active = input.sessions.filter((s) => s.status === 'planned' || s.status === 'done');
  const blockingEvents = input.events.filter((e) => e.blocks_planning && e.kind !== 'reminder');

  // 1) free time per day
  const days: DayState[] = [];
  for (let i = 0; i < profile.planning_horizon_days; i++) {
    const date = addDays(startOfDay(now), i);
    const windowStart = Math.max(atMinutes(date, dayStartMin).getTime(), nowMs);
    const windowEnd = atMinutes(date, dayEndMin).getTime();
    const dayInterval = { start: atMinutes(date, dayStartMin).getTime(), end: windowEnd };
    const state: DayState = {
      windowStart,
      windowEnd,
      free: windowEnd > windowStart ? [{ start: windowStart, end: windowEnd }] : [],
      leisure: [],
      focusUsed: 0,
      chunksPerTask: new Map(),
    };

    let leisureHad = 0;
    for (const r of input.routine) {
      if (!routineAppliesOn(r, date, profile.odd_week_anchor)) continue;
      const iv = {
        start: atMinutes(date, timeToMinutes(r.start_time)).getTime(),
        end: atMinutes(date, timeToMinutes(r.end_time)).getTime(),
      };
      state.free = subtract(state.free, iv);
      if (r.kind === 'leisure') leisureHad += overlapMinutes(iv, dayInterval);
    }
    for (const e of blockingEvents) {
      const iv = eventInterval(e);
      state.free = subtract(state.free, iv);
      if (e.kind === 'leisure') leisureHad += overlapMinutes(iv, dayInterval);
    }
    for (const g of input.gigs ?? []) {
      const iv = gigBusy(g);
      if (iv) state.free = subtract(state.free, iv);
    }
    for (const s of active) {
      const iv = { start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() };
      state.free = subtract(state.free, iv);
      const inDay = overlapMinutes(iv, dayInterval);
      if (s.kind === 'leisure') leisureHad += inDay;
      else {
        state.focusUsed += inDay;
        if (s.task_id && inDay > 0) {
          state.chunksPerTask.set(s.task_id, (state.chunksPerTask.get(s.task_id) ?? 0) + 1);
        }
      }
    }
    state.free = state.free.filter((iv) => minutes(iv) >= 5);

    // 2) reserve evening leisure
    const need = profile.leisure_minutes_per_day - leisureHad;
    if (need >= MIN_LEISURE) reserveLeisure(state, need);

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

    q.remaining = placeTask(q.task.id, q.remaining, limit, urgent, days, 'free', profile, suggestions);
    // a real deadline is at stake: first drop the spreading rule, only then give up leisure
    if (q.remaining > 0 && limit !== null) {
      q.remaining = placeTask(q.task.id, q.remaining, limit, true, days, 'free', profile, suggestions);
    }
    if (q.remaining > 0 && limit !== null) {
      q.remaining = placeTask(q.task.id, q.remaining, limit, true, days, 'leisure', profile, suggestions);
    }
    if (q.remaining > 0) {
      warnings.push({
        taskId: q.task.id,
        missingMinutes: Math.round(q.remaining),
        reason: overdue ? 'overdue' : limit !== null ? 'deadline' : 'horizon',
      });
    }
  }

  // 4) whatever leisure survived becomes a suggestion
  for (const d of days) {
    for (const iv of d.leisure) {
      if (minutes(iv) >= MIN_LEISURE) {
        suggestions.push({ kind: 'leisure', taskId: null, start: new Date(iv.start), end: new Date(iv.end) });
      }
    }
  }

  suggestions.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { suggestions, warnings };
}

function reserveLeisure(day: DayState, need: number) {
  const fits = [...day.free].reverse().find((iv) => minutes(iv) >= need);
  let reserved: Interval | null = null;
  if (fits) {
    reserved = { start: fits.end - need * MINUTE, end: fits.end };
  } else {
    const largest = [...day.free].sort((a, b) => minutes(b) - minutes(a))[0];
    if (largest && minutes(largest) >= MIN_LEISURE) reserved = largest;
  }
  if (!reserved) return;
  reserved = { start: ceilStep(reserved.start), end: reserved.end };
  if (minutes(reserved) < MIN_LEISURE) return;
  day.free = subtract(day.free, reserved);
  day.leisure.push(reserved);
}

function placeTask(
  taskId: string,
  remaining: number,
  deadlineMs: number | null,
  urgent: boolean,
  days: DayState[],
  pool: 'free' | 'leisure',
  profile: PlannerProfile,
  out: Suggestion[],
): number {
  const maxChunks = urgent ? Infinity : MAX_CHUNKS_PER_DAY;

  for (const day of days) {
    if (remaining <= 0) break;
    if (deadlineMs !== null && day.windowStart >= deadlineMs) break;

    while (remaining > 0 && (day.chunksPerTask.get(taskId) ?? 0) < maxChunks) {
      const cap = profile.max_focus_minutes_per_day - day.focusUsed;
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
