import { describe, expect, it } from 'vitest';
import {
  dueNotifications,
  inQuietHours,
  localParts,
  type DueInput,
  type NotifyProfile,
} from '../../supabase/functions/send-notifications/due';

const profile: NotifyProfile = {
  timezone: 'Europe/Bratislava',
  freelance_enabled: true,
  notify_events: true,
  notify_sessions: true,
  session_lead_minutes: 5,
  notify_gigs: true,
  notify_deadlines: true,
  deadline_lead_hours: 24,
  notify_summary: true,
  summary_time: '07:00:00',
  quiet_enabled: true,
  quiet_from: '22:00:00',
  quiet_to: '07:00:00',
};

// 12 Oct 2026 is CEST (UTC+2): 10:00 local = 08:00 UTC
const at = (local: string) => new Date(`2026-10-12T${local}:00+02:00`);
const input = (now: Date, over: Partial<DueInput> = {}): DueInput => ({
  now,
  profile,
  events: [],
  sessions: [],
  gigs: [],
  tasks: [],
  ...over,
});

describe('time zone helpers', () => {
  it('reads local wall-clock time in the user zone', () => {
    expect(localParts(at('07:05'), 'Europe/Bratislava')).toEqual({ date: '2026-10-12', minutes: 7 * 60 + 5 });
    expect(localParts(at('01:30'), 'America/New_York').date).toBe('2026-10-11');
  });

  it('quiet hours wrap around midnight', () => {
    expect(inQuietHours(at('23:30'), profile)).toBe(true);
    expect(inQuietHours(at('06:59'), profile)).toBe(true);
    expect(inQuietHours(at('07:00'), profile)).toBe(false);
    expect(inQuietHours(at('23:30'), { ...profile, quiet_enabled: false })).toBe(false);
  });
});

describe('dueNotifications', () => {
  const event = {
    id: 'e1',
    title: 'Zubár',
    kind: 'event',
    starts_at: at('15:00').toISOString(),
    all_day: false,
    location: 'Poliklinika',
    remind_minutes_before: 30,
  };

  it('fires an event reminder at start minus lead and stays sendable until the event starts', () => {
    expect(dueNotifications(input(at('14:29'), { events: [event] }))).toHaveLength(0);
    const [n] = dueNotifications(input(at('14:30'), { events: [event] }));
    expect(n).toMatchObject({ kind: 'event', title: 'Zubár', body: '15:00, Poliklinika' });
    expect(n.key).toBe(`e:e1:${event.starts_at}:30`);
    // late (job hiccup, phone offline, event added late): still sent, saying how soon
    expect(dueNotifications(input(at('14:41'), { events: [event] }))[0].body).toBe('15:00 (o 19 min), Poliklinika');
    // once it has started there is nothing to remind
    expect(dueNotifications(input(at('15:00'), { events: [event] }))).toHaveLength(0);
  });

  it('announces a moved event again for its new time, right away if needed', () => {
    // reminder for 15:00 went out at 14:30; at 14:50 the user moves it to 15:10
    const moved = { ...event, starts_at: at('15:10').toISOString() };
    const [n] = dueNotifications(input(at('14:50'), { events: [moved] }));
    expect(n.key).not.toBe(`e:e1:${event.starts_at}:30`); // new key, so the log won't swallow it
    expect(n.body).toBe('15:10 (o 20 min), Poliklinika');
  });

  it('a suggestion accepted after its reminder time still gets announced before it starts', () => {
    const block = { id: 's9', kind: 'task', task_id: 't1', starts_at: at('18:45').toISOString(), ends_at: at('19:35').toISOString(), status: 'planned' };
    const tasks = [{ id: 't1', title: 'Fyzika príklady', status: 'todo', deadline: null }];
    const [n] = dueNotifications(input(at('18:41'), { sessions: [block], tasks, profile: { ...profile, session_lead_minutes: 10 } }));
    expect(n.title).toBe('O 4 min: Fyzika príklady');
    expect(dueNotifications(input(at('18:46'), { sessions: [block], tasks, profile: { ...profile, session_lead_minutes: 10 } }))).toHaveLength(0);
  });

  it('respects the per-type switches', () => {
    expect(dueNotifications(input(at('14:30'), { events: [event], profile: { ...profile, notify_events: false } }))).toHaveLength(0);
  });

  it('announces planned work blocks ahead of time with the task name', () => {
    const notes = dueNotifications(
      input(at('15:55'), {
        sessions: [
          { id: 's1', kind: 'task', task_id: 't1', starts_at: at('16:00').toISOString(), ends_at: at('16:50').toISOString(), status: 'planned' },
          { id: 's2', kind: 'task', task_id: 't1', starts_at: at('16:00').toISOString(), ends_at: at('16:50').toISOString(), status: 'suggested' },
        ],
        tasks: [{ id: 't1', title: 'Referát', status: 'todo', deadline: null }],
      }),
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: 'O 5 min: Referát', body: '16:00–16:50' });
  });

  it('tells when to leave for a freelance gig, only when freelance is on', () => {
    const gig = {
      id: 'g1',
      title: 'Sťahovanie',
      mode: 'event',
      status: 'confirmed',
      starts_at: at('14:00').toISOString(),
      location: 'Ružinov',
      prep_minutes: 30,
      travel_minutes: 30,
    };
    expect(dueNotifications(input(at('13:00'), { gigs: [gig] }))[0]).toMatchObject({
      title: 'Čas vyraziť: Sťahovanie',
      body: 'začiatok o 14:00, Ružinov',
    });
    expect(dueNotifications(input(at('13:00'), { gigs: [gig], profile: { ...profile, freelance_enabled: false } }))).toHaveLength(0);
    expect(dueNotifications(input(at('13:00'), { gigs: [{ ...gig, status: 'cancelled' }] }))).toHaveLength(0);
  });

  it('warns a day before a deadline', () => {
    const task = { id: 't1', title: 'Referát', status: 'todo', deadline: new Date('2026-10-13T10:00:00+02:00').toISOString() };
    const [n] = dueNotifications(input(at('10:00'), { tasks: [task] }));
    expect(n).toMatchObject({ kind: 'deadline', title: 'Termín o deň: Referát', body: 'Do 13. 10. o 10:00' });
    // a task added with only 3 hours left says so
    expect(dueNotifications(input(at('07:00'), { tasks: [task], profile: { ...profile, notify_summary: false } }))).toHaveLength(0);
    expect(dueNotifications(input(new Date('2026-10-13T07:00:00+02:00'), { tasks: [task], profile: { ...profile, notify_summary: false } }))[0].title).toBe(
      'Termín o 3 h: Referát',
    );
  });

  it('sends a morning summary once at the chosen time', () => {
    const notes = dueNotifications(
      input(at('07:02'), {
        events: [{ ...event, remind_minutes_before: null }],
        tasks: [{ id: 't1', title: 'Referát', status: 'todo', deadline: at('20:00').toISOString() }],
        // only the summary here; the overdue "a day before" reminder is covered elsewhere
        profile: { ...profile, notify_deadlines: false },
      }),
    );
    expect(notes).toEqual([
      { key: 'sum:2026-10-12', kind: 'summary', title: 'Dnešný deň', body: '1× v kalendári, 1× termín', url: '/' },
    ]);
    expect(dueNotifications(input(at('06:59')))).toHaveLength(0);
  });

  it('keeps only explicit reminders and gig departures during quiet hours', () => {
    const late = { ...event, starts_at: at('23:30').toISOString(), remind_minutes_before: 15 };
    const notes = dueNotifications(
      input(at('23:15'), {
        events: [late],
        sessions: [{ id: 's1', kind: 'task', task_id: null, starts_at: at('23:20').toISOString(), ends_at: at('23:50').toISOString(), status: 'planned' }],
      }),
    );
    expect(notes.map((n) => n.kind)).toEqual(['event']);
  });
});
