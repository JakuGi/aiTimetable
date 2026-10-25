import { useMemo } from 'react';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { useData } from './data';
import { useEditor } from '../editor/Editor';
import { EVENT_KINDS, ROUTINE_KINDS, priorityColor } from './meta';
import { isDayOff, routineAppliesOn, routineSkipped } from './planner';
import { FREELANCE_CATEGORY, FREELANCE_COLOR, fmtMoney, gigEarnings } from './freelance';
import { atMinutes, fmtTime, timeToMinutes } from './time';
import { LEISURE_GREEN, leisureBands, type LeisureBand } from './leisure';
import type { GridItem, StripItem } from '../components/TimeGrid';
import { t } from './i18n';
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
      const dayOff = !opts.routineOnly && isDayOff(day, data.routine_skips);
      for (const r of data.routine_blocks) {
        if (!opts.routineOnly && !routineAppliesOn(r, day, anchor)) continue;
        if (opts.routineOnly) {
          if (!r.weekdays.includes(((day.getDay() + 6) % 7) + 1)) continue;
          if (opts.parity && r.week_parity !== 'all' && r.week_parity !== opts.parity) continue;
        }
        // in a real week a block can be off that day: crossed out, and the time is free
        const off = !opts.routineOnly && routineSkipped(r, day, data.routine_skips);
        items.push({
          id: `r-${r.id}-${day.getTime()}`,
          title: r.title,
          detail: off
            ? dayOff
              ? t('sviatok, voľno')
              : t('odpadá')
            : [r.week_parity === 'odd' ? t('nepárny') : r.week_parity === 'even' ? t('párny') : null, r.location ?? r.notes]
                .filter(Boolean)
                .join(', ') || undefined,
          start: atMinutes(day, timeToMinutes(r.start_time)),
          end: atMinutes(day, timeToMinutes(r.end_time)),
          color: routineColor(r),
          variant: off ? 'cancelled' : 'routine',
          onClick: () => (opts.routineOnly ? editor.editRoutine(r) : editor.editRoutineDay(r, day)),
        });
      }
      if (dayOff) {
        const note = data.routine_skips.find((s) => s.routine_block_id === null && isSameDay(new Date(`${s.day}T00:00`), day))?.note;
        strip.push({
          id: `off-${day.getTime()}`,
          day,
          title: note ? t('Sviatok: {name}', { name: note }) : t('Sviatok, voľno'),
          color: LEISURE_GREEN,
          kind: 'allday',
          onClick: () => editor.editDay(day),
        });
      }
    }
    if (opts.routineOnly) return { items, strip, bands };

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
      const sEnd = new Date(ses.ends_at).getTime();
      const intrudes =
        ses.status !== 'done' &&
        data.free_blocks.some((f) => new Date(f.starts_at).getTime() < sEnd && new Date(f.ends_at).getTime() > s.getTime());
      items.push({
        id: `s-${ses.id}`,
        title: task?.title ?? t('Úloha'),
        detail: intrudes ? t('z vyhradeného voľna') : undefined,
        intrudes,
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
              title: t('{title} (odovzdať do {time})', { title: g.title, time: fmtTime(d) }),
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
            title: g.prep_minutes ? (g.travel_minutes ? t('Príprava a cesta') : t('Príprava')) : t('Cesta'),
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
            title: t('Cesta späť'),
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

    // free time drawn by hand: see-through, but more visible than the automatic window
    for (const f of data.free_blocks) {
      const s = new Date(f.starts_at);
      const e = new Date(f.ends_at);
      if (e.getTime() <= from || s.getTime() >= to) continue;
      items.push({
        id: `f-${f.id}`,
        title: f.note || t('Vyhradené voľno'),
        detail: f.note ? t('vyhradené voľno') : undefined,
        start: s,
        end: e,
        color: LEISURE_GREEN,
        variant: 'reserved',
        onClick: () => editor.editFreeBlock(f),
        onMove: (start, end) => data.update('free_blocks', f.id, { starts_at: start.toISOString(), ends_at: end.toISOString() }),
      });
    }

    for (const task of data.tasks) {
      if (task.status !== 'todo' || !task.deadline) continue;
      const d = new Date(task.deadline);
      const day = days.find((x) => isSameDay(x, d));
      if (!day) continue;
      strip.push({
        id: `t-${task.id}`,
        day,
        title: t('{title} (do {time})', { title: task.title, time: fmtTime(d) }),
        color: priorityColor(data.profile?.priority_colors, task.priority),
        kind: 'deadline',
        onClick: () => editor.editTask(task),
      });
    }

    if (data.profile) {
      bands = leisureBands(days, {
        profile: data.profile,
        routine: data.routine_blocks,
        events: data.events,
        sessions: data.sessions,
        gigs: data.profile.freelance_enabled ? data.gigs : [],
        freeBlocks: data.free_blocks,
        skips: data.routine_skips,
      });
    }

    return { items, strip, bands };
  }, [days, data, editor, routineColor, eventColor, opts.routineOnly, opts.parity]);
}
