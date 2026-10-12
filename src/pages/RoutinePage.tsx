import { useMemo, type CSSProperties } from 'react';
import { TimeGrid } from '../components/TimeGrid';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useCalendarItems, useRoutineColor } from '../lib/useCalendarItems';
import { ROUTINE_KINDS } from '../lib/meta';
import { WEEKDAY_SHORT, isoWeekday, timeToMinutes, weekDays, weekStart, minutesToTime, fmt } from '../lib/time';
import type { RoutineKind } from '../lib/types';

function daysLabel(days: number[]) {
  const sorted = [...days].sort();
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length > 2 && contiguous) return `${WEEKDAY_SHORT[sorted[0] - 1]}–${WEEKDAY_SHORT[sorted[sorted.length - 1] - 1]}`;
  return sorted.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
}

export function RoutinePage() {
  const { routine_blocks, profile } = useData();
  const editor = useEditor();
  const routineColor = useRoutineColor();
  const days = useMemo(() => weekDays(weekStart(new Date())), []);
  const { items } = useCalendarItems(days, { routineOnly: true });
  const dayStartHour = profile ? Math.floor(timeToMinutes(profile.day_start) / 60) : 7;

  const grouped = (Object.keys(ROUTINE_KINDS) as RoutineKind[])
    .map((k) => ({ kind: k, blocks: routine_blocks.filter((b) => b.kind === k) }))
    .filter((g) => g.blocks.length > 0);

  return (
    <div className="page page-routine">
      <header className="toolbar">
        <div className="toolbar-nav">
          <h1 className="toolbar-title">Môj týždeň</h1>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => editor.editRoutine({})}>
            Pridať pravidelný blok
          </button>
        </div>
      </header>
      <p className="lede">
        Hodiny v škole, cesty autobusom, tréningy, brigáda. Čo sa opakuje každý týždeň, zapíš sem raz. Všetko mimo týchto
        blokov (medzi {profile ? minutesToTime(timeToMinutes(profile.day_start)) : '7:00'} a{' '}
        {profile ? minutesToTime(timeToMinutes(profile.day_end)) : '22:00'}) berie plánovač ako tvoj voľný čas.
      </p>

      <div className="routine-layout">
        <section className="week-grid">
          <TimeGrid
            days={days}
            items={items}
            generic
            scrollToHour={dayStartHour}
            onSlotClick={(start) => {
              const m = start.getHours() * 60 + start.getMinutes();
              editor.editRoutine({
                weekdays: [isoWeekday(start)],
                start_time: minutesToTime(m),
                end_time: minutesToTime(Math.min(m + 45, 23 * 60 + 55)),
              });
            }}
          />
        </section>

        <aside className="side-panel">
          {grouped.length === 0 && (
            <div className="empty">
              <p>Zatiaľ prázdne. Klikni do mriežky na čas, kedy máš napríklad prvú hodinu, alebo pridaj blok tlačidlom hore.</p>
            </div>
          )}
          {grouped.map((g) => (
            <section key={g.kind}>
              <h2>{ROUTINE_KINDS[g.kind].label}</h2>
              <ul className="routine-list">
                {g.blocks.map((b) => (
                  <li key={b.id}>
                    <button
                      className="routine-item"
                      style={{ '--c': routineColor(b) } as CSSProperties}
                      onClick={() => editor.editRoutine(b)}
                    >
                      <span className="routine-title">{b.title}</span>
                      <span className="routine-meta">
                        {daysLabel(b.weekdays)}, {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                        {b.location ? `, ${b.location}` : ''}
                      </span>
                      {(b.valid_from || b.valid_until) && (
                        <span className="routine-meta">
                          platí {b.valid_from ? `od ${fmt(`${b.valid_from}T00:00`, 'd. M. yyyy')} ` : ''}
                          {b.valid_until ? `do ${fmt(`${b.valid_until}T00:00`, 'd. M. yyyy')}` : ''}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}
