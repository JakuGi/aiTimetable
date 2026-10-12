import { useMemo } from 'react';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { useData } from './data';
import { useEditor } from '../editor/Editor';
import { EVENT_KINDS, LEISURE_COLOR, ROUTINE_KINDS, priorityColor } from './meta';
import { routineAppliesOn } from './planner';
import { atMinutes, fmtTime, timeToMinutes } from './time';
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
export function useCalendarItems(days: Date[], opts: { routineOnly?: boolean } = {}) {
  const data = useData();
  const editor = useEditor();
  const routineColor = useRoutineColor();
  const eventColor = useEventColor();

  return useMemo(() => {
    const items: GridItem[] = [];
    const strip: StripItem[] = [];
    if (!days.length) return { items, strip };
    const from = startOfDay(days[0]).getTime();
    const to = addDays(startOfDay(days[days.length - 1]), 1).getTime();

    for (const day of days) {
      for (const r of data.routine_blocks) {
        if (!opts.routineOnly && !routineAppliesOn(r, day)) continue;
        if (opts.routineOnly && !r.weekdays.includes(((day.getDay() + 6) % 7) + 1)) continue;
        items.push({
          id: `r-${r.id}-${day.getTime()}`,
          title: r.title,
          detail: r.location ?? r.notes ?? undefined,
          start: atMinutes(day, timeToMinutes(r.start_time)),
          end: atMinutes(day, timeToMinutes(r.end_time)),
          color: routineColor(r),
          variant: 'routine',
          onClick: () => editor.editRoutine(r),
        });
      }
    }
    if (opts.routineOnly) return { items, strip };

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
      });
    }

    for (const ses of data.sessions) {
      if (ses.status === 'skipped') continue;
      const s = new Date(ses.starts_at);
      if (s.getTime() < from || s.getTime() >= to) continue;
      const task = data.taskById(ses.task_id);
      const color =
        ses.kind === 'leisure'
          ? (data.categories.find((c) => c.name === 'Voľný čas')?.color ?? LEISURE_COLOR)
          : (data.categoryById(task?.category_id ?? null)?.color ?? '#2B4BDB');
      items.push({
        id: `s-${ses.id}`,
        title: ses.kind === 'leisure' ? 'Voľný čas' : (task?.title ?? 'Úloha'),
        start: s,
        end: new Date(ses.ends_at),
        color,
        variant: ses.status === 'suggested' ? 'pencil' : ses.status === 'done' ? 'done' : 'solid',
        marker: task ? priorityColor(data.profile?.priority_colors, task.priority) : undefined,
        onClick: () => editor.editSession(ses),
      });
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

    return { items, strip };
  }, [days, data, editor, routineColor, eventColor, opts.routineOnly]);
}
