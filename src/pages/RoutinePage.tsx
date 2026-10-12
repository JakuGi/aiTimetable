import { useMemo, useState, type CSSProperties } from 'react';
import { TimeGrid } from '../components/TimeGrid';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useCalendarItems, useRoutineColor } from '../lib/useCalendarItems';
import { ROUTINE_KINDS } from '../lib/meta';
import {
  WEEKDAY_SHORT,
  fmt,
  isoWeekday,
  minutesToTime,
  timeToMinutes,
  weekDays,
  weekParity,
  weekStart,
} from '../lib/time';
import type { RoutineBlock, RoutineKind } from '../lib/types';

function daysLabel(days: number[]) {
  const sorted = [...days].sort();
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length > 2 && contiguous) return `${WEEKDAY_SHORT[sorted[0] - 1]}–${WEEKDAY_SHORT[sorted[sorted.length - 1] - 1]}`;
  return sorted.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
}

const parityNote = (b: RoutineBlock) => (b.week_parity === 'odd' ? ', nepárny' : b.week_parity === 'even' ? ', párny' : '');

export function RoutinePage() {
  const { routine_blocks, profile } = useData();
  const editor = useEditor();
  const routineColor = useRoutineColor();
  const days = useMemo(() => weekDays(weekStart(new Date())), []);
  const current = profile ? weekParity(new Date(), profile.odd_week_anchor) : 'odd';
  const [shown, setShown] = useState<'odd' | 'even'>(current);
  const { items } = useCalendarItems(days, { routineOnly: true, parity: shown });
  const dayStartHour = profile ? Math.floor(timeToMinutes(profile.day_start) / 60) : 7;

  const grouped = (Object.keys(ROUTINE_KINDS) as RoutineKind[])
    .map((k) => ({ kind: k, blocks: routine_blocks.filter((b) => b.kind === k) }))
    .filter((g) => g.blocks.length > 0);

  return (
    <div className="page page-routine">
      <header className="toolbar">
        <div className="toolbar-nav">
          <h1 className="toolbar-title">Môj týždeň</h1>
          <div className="segmented small" role="radiogroup" aria-label="Zobrazený týždeň">
            {(['odd', 'even'] as const).map((p) => (
              <button key={p} role="radio" aria-checked={shown === p} onClick={() => setShown(p)}>
                {p === 'odd' ? 'Nepárny' : 'Párny'}
                {p === current ? ' (teraz)' : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={() => editor.editRoutine({})}>
            Pridať blok
          </button>
          <button className="btn btn-primary" onClick={() => editor.editClassGrid('all')}>
            Zapísať rozvrh hodín
          </button>
        </div>
      </header>
      <p className="lede">
        Čo sa opakuje každý týždeň: hodiny, tréningy, brigáda. Hodiny najrýchlejšie zapíšeš v tabuľke cez{' '}
        <b>Zapísať rozvrh hodín</b>. Autobusy sem nepatria, tie si vkladáš do konkrétneho týždňa v Rozvrhu ako spoje.
        Plánovač berie všetko mimo týchto blokov (medzi{' '}
        {profile ? minutesToTime(timeToMinutes(profile.day_start)) : '7:00'} a{' '}
        {profile ? minutesToTime(timeToMinutes(profile.day_end)) : '22:00'}) ako tvoj voľný čas.
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
              <p>
                Zatiaľ prázdne. Začni tlačidlom <b>Zapísať rozvrh hodín</b>, vyplníš ho ako tabuľku v škole.
              </p>
            </div>
          )}
          {grouped.map((g) => (
            <section key={g.kind}>
              <h2>{ROUTINE_KINDS[g.kind].label}</h2>
              {g.kind === 'class' && (
                <div className="quick-row">
                  <button className="link-btn" onClick={() => editor.editClassGrid('all')}>
                    Upraviť v tabuľke
                  </button>
                  <button className="link-btn" onClick={() => editor.editClassGrid('odd')}>
                    len nepárny
                  </button>
                  <button className="link-btn" onClick={() => editor.editClassGrid('even')}>
                    len párny
                  </button>
                </div>
              )}
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
                        {parityNote(b)}
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
