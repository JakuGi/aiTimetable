import { describe, expect, it } from 'vitest';
import { gigBusy, gigEarnings, gigExpenses, gigHours, gigNet } from './freelance';
import { plan, type PlannerProfile } from './planner';
import type { Gig, Session, Task } from './types';

const base: Gig = {
  id: 'g1',
  user_id: 'u',
  title: 'Sťahovanie bytu',
  mode: 'event',
  client: null,
  contact: null,
  status: 'confirmed',
  starts_at: new Date(2026, 9, 12, 14, 0).toISOString(),
  ends_at: new Date(2026, 9, 12, 18, 0).toISOString(),
  location: 'Ružinov',
  prep_minutes: 30,
  travel_minutes: 30,
  prep_notes: null,
  deadline: null,
  estimated_minutes: null,
  task_id: null,
  pay_type: 'hourly',
  pay_amount: '12.50',
  hours: null,
  expenses: [
    { id: 'a', label: 'Doprava', amount: 4.6 },
    { id: 'b', label: 'Jedlo', amount: 6 },
  ],
  paid_at: null,
  notes: null,
  created_at: new Date(2026, 9, 1).toISOString(),
};

describe('gig money', () => {
  it('hourly pay uses the event length unless hours are entered', () => {
    expect(gigHours(base, []).hours).toBe(4);
    expect(gigEarnings(base, [])).toBe(50);
    expect(gigEarnings({ ...base, hours: '5' }, [])).toBe(62.5);
  });

  it('subtracts expenses for the net amount', () => {
    expect(gigExpenses(base)).toBeCloseTo(10.6);
    expect(gigNet(base, [])).toBeCloseTo(39.4);
  });

  it('fixed pay ignores hours; cancelled gigs earn nothing', () => {
    expect(gigEarnings({ ...base, pay_type: 'fixed', pay_amount: 80 }, [])).toBe(80);
    expect(gigEarnings({ ...base, status: 'cancelled' }, [])).toBe(0);
  });

  it('project hours come from finished work sessions of the linked task', () => {
    const project: Gig = { ...base, mode: 'project', starts_at: null, ends_at: null, task_id: 't', estimated_minutes: 600 };
    const done: Session = {
      id: 's',
      user_id: 'u',
      kind: 'task',
      task_id: 't',
      starts_at: new Date(2026, 9, 12, 9).toISOString(),
      ends_at: new Date(2026, 9, 12, 11, 30).toISOString(),
      status: 'done',
    };
    expect(gigHours(project, []).hours).toBe(10); // estimate
    expect(gigHours(project, [done])).toEqual({ hours: 2.5, source: 'tracked' });
  });

  it('busy time covers travel and preparation before, travel after', () => {
    const b = gigBusy(base)!;
    expect(new Date(b.start).getHours()).toBe(13);
    expect(new Date(b.end).getHours()).toBe(18);
    expect(new Date(b.end).getMinutes()).toBe(30);
    expect(gigBusy({ ...base, status: 'cancelled' })).toBeNull();
  });
});

describe('planner with gigs', () => {
  it('does not schedule work during a gig, its preparation or travel', () => {
    const profile: PlannerProfile = {
      day_start: '12:00:00',
      day_end: '20:00:00',
      focus_block_minutes: 60,
      break_minutes: 0,
      max_focus_minutes_per_day: 480,
      leisure_minutes_per_day: 0,
      planning_horizon_days: 1,
      odd_week_anchor: '2026-10-12',
    };
    const task: Task = {
      id: 't1',
      user_id: 'u',
      title: 'Úloha',
      notes: null,
      category_id: null,
      priority: 2,
      estimated_minutes: 240,
      deadline: null,
      status: 'todo',
      completed_at: null,
      created_at: base.created_at,
    };
    const { suggestions } = plan({
      now: new Date(2026, 9, 12, 12, 0),
      profile,
      routine: [],
      events: [],
      sessions: [],
      tasks: [task],
      gigs: [base],
    });
    const busyFrom = new Date(2026, 9, 12, 13, 0).getTime();
    const busyTo = new Date(2026, 9, 12, 18, 30).getTime();
    for (const s of suggestions) {
      expect(s.start.getTime() >= busyTo || s.end.getTime() <= busyFrom).toBe(true);
    }
    // free windows are 12:00-13:00 and 18:30-20:00; a task without deadline gets max 2 blocks a day
    expect(suggestions.map((s) => s.start.getHours() * 60 + s.start.getMinutes())).toEqual([12 * 60, 18 * 60 + 30]);
  });
});
