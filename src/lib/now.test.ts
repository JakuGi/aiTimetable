import { describe, expect, it } from 'vitest';
import { currentLine, nextLine, nowAndNext, type NowInput } from './now';
import type { CalendarEvent, Gig, RoutineBlock, Session, Task } from './types';

// Tuesday 13 Oct 2026
const at = (h: number, m = 0, day = 13) => new Date(2026, 9, day, h, m);
const lesson = (id: string, title: string, start: string, end: string): RoutineBlock => ({
  id,
  user_id: 'u',
  title,
  kind: 'class',
  weekdays: [1, 2, 3, 4, 5],
  start_time: start,
  end_time: end,
  location: null,
  notes: null,
  category_id: null,
  color: null,
  valid_from: null,
  valid_until: null,
  week_parity: 'all',
});
const tasks = [{ id: 't1', title: 'Fyzika príklady' } as Task];
const work: Session = {
  id: 's1',
  user_id: 'u',
  kind: 'task',
  task_id: 't1',
  starts_at: at(15, 25).toISOString(),
  ends_at: at(16, 15).toISOString(),
  status: 'planned',
};
const bus = {
  id: 'b',
  title: 'Bus domov',
  kind: 'commute',
  starts_at: at(13, 50).toISOString(),
  ends_at: at(14, 25).toISOString(),
  all_day: false,
} as CalendarEvent;
const input = (now: Date, over: Partial<NowInput> = {}): NowInput => ({
  now,
  oddAnchor: '2026-10-12',
  routine: [lesson('m', 'Matematika', '08:00', '08:45'), lesson('f', 'Fyzika', '08:55', '09:40')],
  events: [bus],
  sessions: [work],
  tasks,
  gigs: [],
  freeBlocks: [],
  ...over,
});

describe('now and next', () => {
  it('a lesson in progress and the one after it', () => {
    const now = at(8, 30);
    const { current, next } = nowAndNext(input(now));
    expect(currentLine(current, now, 'm')).toEqual({ lead: 'Práve prebieha', title: 'Matematika', detail: 'do 8:45 · ešte 15 min' });
    expect(nextLine(next, now)).toMatchObject({ lead: 'O 25 min ti začína', title: 'Fyzika' });
  });

  it('the bus, then work later in the day', () => {
    const now = at(13, 40);
    const { current, next } = nowAndNext(input(now));
    expect(currentLine(current, now, 'f').lead).toBe('Teraz si voľná');
    expect(nextLine(next, now)).toMatchObject({ lead: 'O 10 min ti ide', title: 'Bus domov' });
    const later = at(14, 30);
    expect(nextLine(nowAndNext(input(later)).next, later)).toMatchObject({ lead: 'O 55 min začínaš', title: 'Fyzika príklady' });
  });

  it('work in progress beats the school bell, and evenings point to tomorrow', () => {
    const now = at(15, 50);
    expect(currentLine(nowAndNext(input(now)).current, now, 'm')).toMatchObject({ lead: 'Práve máš na práci', detail: 'do 16:15 · ešte 25 min' });
    const evening = at(21, 0);
    expect(nextLine(nowAndNext(input(evening)).next, evening)).toMatchObject({ lead: 'Zajtra o 8:00 ti začína', title: 'Matematika' });
  });

  it('a gig counts from the moment to leave', () => {
    const gig = {
      id: 'g',
      title: 'Sťahovanie',
      mode: 'event',
      status: 'confirmed',
      starts_at: at(18).toISOString(),
      ends_at: at(20).toISOString(),
      prep_minutes: 15,
      travel_minutes: 30,
    } as Gig;
    const now = at(17, 0);
    expect(nextLine(nowAndNext(input(now, { sessions: [], gigs: [gig] })).next, now)).toEqual({
      lead: 'O 15 min treba vyraziť na',
      title: 'Sťahovanie',
      detail: 'začiatok o 18:00',
    });
  });
});
