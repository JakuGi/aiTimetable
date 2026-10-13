import { describe, expect, it } from 'vitest';
import { plan, planFollowUp, subtract, type PlannerProfile } from './planner';
import { weekParity } from './time';
import type { CalendarEvent, RoutineBlock, Session, Task } from './types';

const profile: PlannerProfile = {
  day_start: '08:00:00',
  day_end: '20:00:00',
  focus_block_minutes: 60,
  break_minutes: 10,
  max_focus_minutes_per_day: 180,
  leisure_minutes_per_day: 60,
  planning_horizon_days: 7,
  odd_week_anchor: '2026-10-12', // the test week is odd
};

// Monday 12 Oct 2026, 07:00 local time
const now = new Date(2026, 9, 12, 7, 0);

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? 't1',
    user_id: 'u',
    title: 'Úloha',
    notes: null,
    category_id: null,
    priority: 2,
    estimated_minutes: 60,
    deadline: null,
    status: 'todo',
    completed_at: null,
    created_at: now.toISOString(),
    ...over,
  };
}

function routine(over: Partial<RoutineBlock>): RoutineBlock {
  return {
    id: 'r1',
    user_id: 'u',
    title: 'Škola',
    kind: 'class',
    weekdays: [1, 2, 3, 4, 5],
    start_time: '08:00:00',
    end_time: '14:00:00',
    location: null,
    notes: null,
    category_id: null,
    color: null,
    valid_from: null,
    valid_until: null,
    week_parity: 'all',
    ...over,
  };
}

const overlaps = (a: { start: Date; end: Date }, s: number, e: number) =>
  a.start.getTime() < e && a.end.getTime() > s;

describe('subtract', () => {
  it('splits an interval around a busy block', () => {
    expect(subtract([{ start: 0, end: 100 }], { start: 40, end: 60 })).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
  });
});

describe('weekParity', () => {
  it('alternates from the anchor, also across new year', () => {
    expect(weekParity(new Date(2026, 9, 14), '2026-10-12')).toBe('odd');
    expect(weekParity(new Date(2026, 9, 19), '2026-10-12')).toBe('even');
    expect(weekParity(new Date(2026, 9, 5), '2026-10-12')).toBe('even');
    // 2026 has 53 ISO weeks; anchor counting must not break on 4 Jan 2027
    expect(weekParity(new Date(2026, 11, 28), '2026-10-12')).toBe('even');
    expect(weekParity(new Date(2027, 0, 4), '2026-10-12')).toBe('odd');
  });
});

describe('plan', () => {
  it('uses odd/even week blocks only in their weeks', () => {
    const evenOnly = routine({ id: 'lab', week_parity: 'even', start_time: '08:00:00', end_time: '20:00:00' });
    const { suggestions } = plan({
      now,
      profile: { ...profile, planning_horizon_days: 14, leisure_minutes_per_day: 0 },
      routine: [evenOnly],
      events: [],
      sessions: [],
      tasks: [task({ estimated_minutes: 60 })],
    });
    // the odd test week is free, so work lands on Monday 12 Oct
    expect(suggestions[0].start.getDate()).toBe(12);
  });

  it('never overlaps routine blocks and respects day bounds', () => {
    const r = routine({});
    const { suggestions } = plan({
      now,
      profile,
      routine: [r],
      events: [],
      sessions: [],
      tasks: [task({ estimated_minutes: 300 })],
    });
    const work = suggestions.filter((s) => s.kind === 'task');
    expect(work.reduce((m, s) => m + (s.end.getTime() - s.start.getTime()) / 60000, 0)).toBe(300);
    for (const s of work) {
      const d = s.start;
      const isWeekday = d.getDay() >= 1 && d.getDay() <= 5;
      if (isWeekday) {
        const schoolStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8).getTime();
        const schoolEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14).getTime();
        expect(overlaps(s, schoolStart, schoolEnd)).toBe(false);
      }
      expect(s.start.getHours()).toBeGreaterThanOrEqual(8);
      expect(s.end.getHours() * 60 + s.end.getMinutes()).toBeLessThanOrEqual(20 * 60);
    }
  });

  it('places work before the deadline and warns when it cannot fit', () => {
    const deadline = new Date(2026, 9, 12, 18, 0).toISOString();
    const { suggestions, warnings } = plan({
      now,
      profile,
      routine: [routine({})],
      events: [],
      sessions: [],
      tasks: [task({ estimated_minutes: 600, deadline, priority: 4 })],
    });
    const work = suggestions.filter((s) => s.kind === 'task');
    expect(work.length).toBeGreaterThan(0);
    for (const s of work) expect(s.end.getTime()).toBeLessThanOrEqual(new Date(deadline).getTime());
    expect(warnings[0]).toMatchObject({ taskId: 't1', reason: 'deadline' });
  });

  it('caps daily focus time and keeps evening leisure', () => {
    const { suggestions } = plan({
      now,
      profile: { ...profile, planning_horizon_days: 1 },
      routine: [],
      events: [],
      sessions: [],
      tasks: [task({ id: 'a', estimated_minutes: 120 }), task({ id: 'b', estimated_minutes: 120 })],
    });
    const work = suggestions.filter((s) => s.kind === 'task');
    const total = work.reduce((m, s) => m + (s.end.getTime() - s.start.getTime()) / 60000, 0);
    expect(total).toBe(180);
    const leisure = suggestions.filter((s) => s.kind === 'leisure');
    expect(leisure).toHaveLength(1);
    expect(leisure[0].end.getHours()).toBe(20);
  });

  it('skips gaps too short for real work (school ends 13:35, bus at 13:50)', () => {
    const { suggestions } = plan({
      now,
      profile,
      routine: [
        routine({ id: 'school', end_time: '13:35:00' }),
        routine({ id: 'bus', kind: 'other', start_time: '13:50:00', end_time: '14:25:00' }),
      ],
      events: [],
      sessions: [],
      tasks: [task({ estimated_minutes: 120 })],
    });
    for (const s of suggestions.filter((x) => x.kind === 'task')) {
      expect(s.end.getTime() - s.start.getTime()).toBeGreaterThanOrEqual(30 * 60000);
      expect(s.start.getHours() * 60 + s.start.getMinutes()).not.toBe(13 * 60 + 35);
    }
  });

  it('spreads a deadline task over free days before giving up evening leisure', () => {
    const { suggestions, warnings } = plan({
      now,
      profile,
      routine: [routine({})],
      events: [],
      sessions: [],
      // due Thursday morning, 4 h of work: fits Mon–Wed afternoons without touching leisure
      tasks: [task({ estimated_minutes: 240, priority: 4, deadline: new Date(2026, 9, 15, 8).toISOString() })],
    });
    expect(warnings).toHaveLength(0);
    const leisure = suggestions.filter((s) => s.kind === 'leisure');
    // Mon, Tue, Wed evenings stay free (each 19:00–20:00)
    for (const day of [12, 13, 14]) {
      expect(leisure.some((l) => l.start.getDate() === day && l.start.getHours() === 19)).toBe(true);
    }
  });

  it('schedules urgent tasks before relaxed ones', () => {
    const { suggestions } = plan({
      now,
      profile,
      routine: [],
      events: [],
      sessions: [],
      tasks: [
        task({ id: 'later', priority: 1, deadline: new Date(2026, 9, 18, 12).toISOString() }),
        task({ id: 'soon', priority: 2, deadline: new Date(2026, 9, 13, 12).toISOString() }),
      ],
    });
    const work = suggestions.filter((s) => s.kind === 'task');
    expect(work[0].taskId).toBe('soon');
  });

  it('treats events and planned sessions as busy and counts planned work', () => {
    const event: CalendarEvent = {
      id: 'e',
      user_id: 'u',
      title: 'Zubár',
      kind: 'event',
      starts_at: new Date(2026, 9, 12, 8, 0).toISOString(),
      ends_at: new Date(2026, 9, 12, 12, 0).toISOString(),
      all_day: false,
      location: null,
      notes: null,
      category_id: null,
      color: null,
      remind_minutes_before: null,
      blocks_planning: true,
    };
    const planned: Session = {
      id: 's',
      user_id: 'u',
      kind: 'task',
      task_id: 't1',
      starts_at: new Date(2026, 9, 12, 12, 0).toISOString(),
      ends_at: new Date(2026, 9, 12, 12, 30).toISOString(),
      status: 'planned',
    };
    const { suggestions } = plan({
      now,
      profile,
      routine: [],
      events: [event],
      sessions: [planned],
      tasks: [task({ estimated_minutes: 90 })],
    });
    const work = suggestions.filter((s) => s.kind === 'task');
    const total = work.reduce((m, s) => m + (s.end.getTime() - s.start.getTime()) / 60000, 0);
    expect(total).toBe(60);
    expect(work[0].start.getTime()).toBeGreaterThanOrEqual(new Date(2026, 9, 12, 12, 30).getTime());
  });
});

describe('planFollowUp', () => {
  const session = (over: Partial<Session>): Session => ({
    id: 's',
    user_id: 'u',
    kind: 'task',
    task_id: 't1',
    starts_at: new Date(2026, 9, 12, 8, 0).toISOString(),
    ends_at: new Date(2026, 9, 12, 9, 0).toISOString(),
    status: 'done',
    ...over,
  });
  const minutesOf = (s: { start: Date; end: Date }[]) => s.reduce((m, x) => m + (x.end.getTime() - x.start.getTime()) / 60000, 0);

  it('plans exactly the extra time, even when the estimate is already covered', () => {
    const { suggestions } = planFollowUp(
      { now, profile, routine: [], events: [], sessions: [session({})], tasks: [task({ estimated_minutes: 60 })] },
      't1',
      45,
    );
    expect(suggestions.every((s) => s.kind === 'task' && s.taskId === 't1')).toBe(true);
    expect(minutesOf(suggestions)).toBe(45);
  });

  it('goes around other pencil suggestions and keeps them', () => {
    const other = session({
      id: 'o',
      task_id: 't2',
      starts_at: new Date(2026, 9, 12, 8, 0).toISOString(),
      ends_at: new Date(2026, 9, 12, 10, 0).toISOString(),
      status: 'suggested',
    });
    const { suggestions } = planFollowUp(
      { now, profile, routine: [], events: [], sessions: [other], tasks: [task({}), task({ id: 't2' })] },
      't1',
      30,
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].start.getTime()).toBeGreaterThanOrEqual(new Date(2026, 9, 12, 10, 0).getTime());
  });

  it('reports what did not fit before the deadline', () => {
    const { suggestions, warnings } = planFollowUp(
      {
        now,
        profile,
        routine: [routine({ start_time: '08:00:00', end_time: '19:30:00' })],
        events: [],
        sessions: [],
        tasks: [task({ deadline: new Date(2026, 9, 12, 20, 0).toISOString() })],
      },
      't1',
      90,
    );
    expect(minutesOf(suggestions)).toBe(30);
    expect(warnings[0]).toMatchObject({ taskId: 't1', missingMinutes: 60 });
  });
});

describe('breaks', () => {
  it('keeps a break after a block that is already planned', () => {
    const planned: Session = {
      id: 'p',
      user_id: 'u',
      kind: 'task',
      task_id: 't2',
      starts_at: new Date(2026, 9, 12, 8, 0).toISOString(),
      ends_at: new Date(2026, 9, 12, 9, 0).toISOString(),
      status: 'planned',
    };
    const { suggestions } = plan({ now, profile, routine: [], events: [], sessions: [planned], tasks: [task({}), task({ id: 't2', estimated_minutes: 60 })] });
    const first = suggestions.find((s) => s.taskId === 't1')!;
    expect(first.start.getTime()).toBe(new Date(2026, 9, 12, 9, 10).getTime());
  });
});
