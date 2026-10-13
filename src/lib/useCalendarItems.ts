import { useMemo } from 'react';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { useData } from './data';
import { useEditor } from '../editor/Editor';
import { EVENT_KINDS, ROUTINE_KINDS, priorityColor } from './meta';
import { routineAppliesOn } from './planner';
import { FREELANCE_CATEGORY, FREELANCE_COLOR, fmtMoney, gigEarnings } from './freelance';
import { atMinutes, fmtTime, timeToMinutes } from './time';
import { leisureBands, type LeisureBand } from './leisure';
import type { GridItem, StripItem } from '../components/TimeGrid';
import type { CalendarEvent, RoutineBlock } from './types';

export function useRoutineColor() {
  const { categoryById } = useData();
  return (r: RoutineBlock) => r.color ?? categoryById(r.category_id)?.color ?? ROUTINE_KINDS[r.kind].color;
}

export function useEventColor() {
  const { categoryById } = useData();
  return (e: CalendarEvent) => e.color ?? categoryById(e.category_id)?.color ?? EVENT_KINDS[e.kind].color;
}

/** Everything that happens on the given days, shaped for <TimeGrid>. */
export function useCalendarItems(days: Date[], opts: { routineOnly?: boolean; parity?: 'odd' | 'even' } = {}) {
  const data = useData();
  const editor = useEditor();
  const routineColor = useRoutineColor();
  const eventColor = useEventColor();

  return useMemo(() => {
    const items: GridItem[] = [];
    const strip: StripItem[] = [];
    let bands: LeisureBand[] = [];
    if (!days.length) return { items, strip, bands };
    const from = startOfDay(days[0]).getTime();
    const to = addDays(startOfDay(days[days.length - 1]), 1).getTime();
    const anchor = data.profile?.odd_week_anchor ?? '2024-01-01';

    for (const day of days) {
      for (const r of data.routine_blocks) {
        if (!opts.routineOnly && !routineAppliesOn(r, day, anchor)) continue;
        if (opts.routineOnly) {
          if (!r.weekdays.includes(((day.getDay() + 6) % 7) + 1)) continue;
          if (opts.parity && r.week_parity !== 'all' && r.week_parity !== opts.parity) continue;
        }
        items.push({
          id: `r-${r.id}-${day.getTime()}`,
          title: r.title,
          detail:
            [r.week_parity === 'odd' ? 'nepárny' : r.week_parity === 'even' ? 'párny' : null, r.location ?? r.notes]
              .filter(Boolean)
              .join(', ') || undefined,
          start: atMinutes(day, timeToMinutes(r.start_time)),
          end: atMinutes(day, timeToMinutes(r.end_time)),
          color: routineColor(r),
          variant: 'routine',
          onClick: () => editor.editRoutine(r),
        });
      }
    }
    if (opts.routineOnly) {
      // the usual week: where free time falls given just the routine
      if (data.profile) {
        bands = leisureBands(
          days,
          { profile: data.profile, routine: data.routine_blocks, events: [], sessions: [], gigs: [] },
          {
            includePast: true,
            now: new Date(0),
            noGaps: true,
            routineOn: (r, day) =>
              r.weekdays.includes(((day.getDay() + 6) % 7) + 1) &&
              (!opts.parity || r.week_parity === 'all' || r.week_parity === opts.parity),
          },
        );
      }
      return { items, strip, bands };
    }

    for (const e of data.events) {
      const s = new Date(e.starts_at);
      const end = e.ends_at ? new Date(e.ends_at) : s;
      if (end.getTime() < from || s.getTime() >= to) continue;
      const color = eventColor(e);
      if (e.all_day || e.kind === 'reminder') {
        for (const day of days) {
          const dayStart = startOfDay(day).getTime();
          if (s.getTime() < dayStart + 86_400_000 && end.getTime() >= dayStart) {
            strip.push({
              id: `e-${e.id}-${day.getTime()}`,
              day,
              title: e.all_day ? e.title : `${fmtTime(s)} ${e.title}`,
              color,
              kind: e.kind === 'reminder' ? 'reminder' : 'allday',
              onClick: () => editor.editEvent(e),
            });
          }
        }
        continue;
      }
      items.push({
        id: `e-${e.id}`,
        title: e.title,
        detail: e.location ?? undefined,
        start: s,
        end,
        color,
        variant: 'solid',
        onClick: () => editor.editEvent(e),
        onMove: (start, end) =>
          data.update('events', e.id, { starts_at: start.toISOString(), ends_at: end.toISOString() }),
      });
    }

    for (const ses of data.sessions) {
      // free time is drawn as a faint window now; old accepted free-time blocks stay in history only
      if (ses.status === 'skipped' || ses.kind === 'leisure') continue;
      const s = new Date(ses.starts_at);
      if (s.getTime() < from || s.getTime() >= to) continue;
      const task = data.taskById(ses.task_id);
      const color = data.categoryById(task?.category_id ?? null)?.color ?? '#2B4BDB';
      items.push({
        id: `s-${ses.id}`,
        title: task?.title ?? 'Úloha',
        start: s,
        end: new Date(ses.ends_at),
        color,
        variant: ses.status === 'suggested' ? 'pencil' : ses.status === 'done' ? 'done' : 'solid',
        marker: task ? priorityColor(data.profile?.priority_colors, task.priority) : undefined,
        onClick: () => editor.editSession(ses),
        // pencil and planned blocks can be rearranged; finished work stays where it happened
        onMove:
          ses.status === 'done'
            ? undefined
            : (start, end) =>
                data.update('sessions', ses.id, { starts_at: start.toISOString(), ends_at: end.toISOString() }),
      });
    }

    // freelance gigs: the gig itself, plus travel/preparation before and travel back after
    if (data.profile?.freelance_enabled) {
      const color = data.categories.find((c) => c.name === FREELANCE_CATEGORY)?.color ?? FREELANCE_COLOR;
      for (const g of data.gigs) {
        if (g.status === 'cancelled') continue;
        if (g.mode === 'project') {
          if (!g.deadline || g.status === 'paid') continue;
          const d = new Date(g.deadline);
          const day = days.find((x) => isSameDay(x, d));
          if (day) {
            strip.push({
              id: `g-${g.id}`,
              day,
              title: `${g.title} (odovzdať do ${fmtTime(d)})`,
              color,
              kind: 'deadline',
              onClick: () => editor.editGig(g),
            });
          }
          continue;
        }
        if (!g.starts_at || !g.ends_at) continue;
        const s = new Date(g.starts_at);
        const e = new Date(g.ends_at);
        if (e.getTime() < from || s.getTime() >= to) continue;
        const before = g.prep_minutes + g.travel_minutes;
        if (before > 0) {
          items.push({
            id: `gp-${g.id}`,
            title: g.prep_minutes ? (g.travel_minutes ? 'Príprava a cesta' : 'Príprava') : 'Cesta',
            detail: g.title,
            start: new Date(s.getTime() - before * 60_000),
            end: s,
            color,
            variant: 'routine',
            onClick: () => editor.editGig(g),
          });
        }
        if (g.travel_minutes > 0) {
          items.push({
            id: `gt-${g.id}`,
            title: 'Cesta späť',
            start: e,
            end: new Date(e.getTime() + g.travel_minutes * 60_000),
            color,
            variant: 'routine',
            onClick: () => editor.editGig(g),
          });
        }
        const pay = gigEarnings(g, data.sessions);
        items.push({
          id: `g-${g.id}`,
          title: g.title,
          detail: [g.location, pay > 0 ? fmtMoney(pay) : null].filter(Boolean).join(', ') || undefined,
          start: s,
          end: e,
          color,
          variant: g.status === 'done' || g.status === 'paid' ? 'done' : 'solid',
          onClick: () => editor.editGig(g),
          onMove: (start, end) => data.update('gigs', g.id, { starts_at: start.toISOString(), ends_at: end.toISOString() }),
        });
      }
    }

    for (const t of data.tasks) {
      if (t.status !== 'todo' || !t.deadline) continue;
      const d = new Date(t.deadline);
      const day = days.find((x) => isSameDay(x, d));
      if (!day) continue;
      strip.push({
        id: `t-${t.id}`,
        day,
        title: `${t.title} (do ${fmtTime(d)})`,
        color: priorityColor(data.profile?.priority_colors, t.priority),
        kind: 'deadline',
        onClick: () => editor.editTask(t),
      });
    }

    if (data.profile) {
      bands = leisureBands(days, {
        profile: data.profile,
        routine: data.routine_blocks,
        events: data.events,
        sessions: data.sessions,
        gigs: data.profile.freelance_enabled ? data.gigs : [],
      });
    }

    return { items, strip, bands };
  }, [days, data, editor, routineColor, eventColor, opts.routineOnly, opts.parity]);
}
