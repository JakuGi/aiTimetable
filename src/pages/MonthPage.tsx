import { useMemo, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, addMonths, endOfMonth, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth } from 'date-fns';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useCalendarItems } from '../lib/useCalendarItems';
import { WEEKDAY_SHORT, atMinutes, fmt, fmtTime, toDateInput, weekStart } from '../lib/time';
import { Chevron } from './WeekPage';

export function MonthPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const editor = useEditor();
  const { sessions } = useData();
  const month = startOfMonth(params.get('m') ? new Date(`${params.get('m')}-01T00:00`) : new Date());

  const days = useMemo(() => {
    const first = weekStart(month);
    const last = endOfMonth(month);
    const out: Date[] = [];
    for (let d = first; d <= last || out.length % 7 !== 0; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month.getTime()]);

  const { items, strip } = useCalendarItems(days);
  const setMonth = (m: Date) => setParams({ m: fmt(m, 'yyyy-MM') }, { replace: true });

  return (
    <div className="page page-month">
      <header className="toolbar">
        <div className="toolbar-nav">
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Predchádzajúci mesiac">
            <Chevron dir="left" />
          </button>
          <button className="btn btn-ghost" onClick={() => setMonth(new Date())} disabled={isSameMonth(month, new Date())}>
            Tento mesiac
          </button>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Ďalší mesiac">
            <Chevron dir="right" />
          </button>
          <h1 className="toolbar-title">{fmt(month, 'LLLL yyyy')}</h1>
        </div>
        <div className="toolbar-actions">
          <button
            className="btn btn-primary"
            onClick={() => editor.editEvent({ starts_at: atMinutes(new Date(), 17 * 60).toISOString() })}
          >
            Pridať udalosť
          </button>
        </div>
      </header>

      <div className="month" role="grid" aria-label={fmt(month, 'LLLL yyyy')}>
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="month-dow" role="columnheader">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dayItems = items
            .filter((i) => isSameDay(i.start, day) && i.variant !== 'routine')
            .sort((a, b) => a.start.getTime() - b.start.getTime());
          const work = sessions.filter(
            (s) => s.kind === 'task' && s.status !== 'skipped' && isSameDay(new Date(s.starts_at), day),
          ).length;
          const events = dayItems.filter((i) => !i.id.startsWith('s-'));
          const chips = strip.filter((s) => isSameDay(s.day, day));
          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              className={`month-cell${isSameMonth(day, month) ? '' : ' is-out'}${isToday(day) ? ' is-today' : ''}`}
            >
              <button
                className="month-date"
                onClick={() => navigate(`/?d=${toDateInput(day)}&view=day`)}
                aria-label={`Otvoriť ${fmt(day, 'EEEE d. MMMM')}`}
              >
                {fmt(day, 'd')}
              </button>
              <div className="month-items">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    className={`strip-chip chip-${c.kind}`}
                    style={{ '--c': c.color } as CSSProperties}
                    onClick={c.onClick}
                  >
                    {c.title}
                  </button>
                ))}
                {events.slice(0, 3).map((i) => (
                  <button key={i.id} className="month-event" style={{ '--c': i.color } as CSSProperties} onClick={i.onClick}>
                    <b>{fmtTime(i.start)}</b> {i.title}
                  </button>
                ))}
                {events.length > 3 && <span className="month-more">a ďalšie {events.length - 3}</span>}
                {work > 0 && (
                  <span className="month-work">
                    {work} {work === 1 ? 'blok' : work < 5 ? 'bloky' : 'blokov'} práce
                  </span>
                )}
              </div>
              <button
                className="month-add"
                aria-label={`Pridať udalosť ${fmt(day, 'd. M.')}`}
                onClick={() => editor.editEvent({ starts_at: atMinutes(startOfDay(day), 17 * 60).toISOString() })}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
