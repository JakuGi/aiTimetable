import { describe, expect, it } from 'vitest';
import { leisureBands } from './leisure';
import type { PlannerProfile } from './planner';
import type { RoutineBlock } from './types';

const profile: PlannerProfile = {
  day_start: '08:00:00',
  day_end: '20:00:00',
  focus_block_minutes: 60,
  break_minutes: 10,
  max_focus_minutes_per_day: 180,
  leisure_minutes_per_day: 60,
  planning_horizon_days: 7,
  odd_week_anchor: '2026-10-12',
};

// Monday 12 Oct 2026
const day = new Date(2026, 9, 12);
const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).getTime();

const school: RoutineBlock = {
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
};

describe('free time suggestions', () => {
  it('shows the free part of a day without any work', () => {
    const bands = leisureBands([day], { profile, routine: [school], events: [], sessions: [] }, { now: new Date(at(7)) });
    expect(bands.map((b) => [b.start.getTime(), b.end.getTime()])).toEqual([[at(14), at(20)]]);
  });

  it('shows nothing when free time between work is switched off', () => {
    const bands = leisureBands(
      [day],
      { profile: { ...profile, leisure_minutes_per_day: 0 }, routine: [school], events: [], sessions: [] },
      { now: new Date(at(7)) },
    );
    expect(bands).toEqual([]);
  });
});
