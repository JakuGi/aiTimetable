import { useMemo, useState, type CSSProperties } from 'react';
import { TimeGrid } from '../components/TimeGrid';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useCalendarItems, useRoutineColor } from '../lib/useCalendarItems';
import { ROUTINE_KINDS } from '../lib/meta';
import {
  weekdayShort,
  weekdaysShort,
  fmt,
  isoWeekday,
  minutesToTime,
  timeToMinutes,
  weekDays,
  weekParity,
  weekStart,
} from '../lib/time';
import type { RoutineBlock, RoutineKind } from '../lib/types';
import { useMediaQuery } from '../lib/useMediaQuery';
import { t } from '../lib/i18n';

function daysLabel(days: number[]) {
  const sorted = [...days].sort();
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length > 2 && contiguous) return `${weekdayShort(sorted[0] - 1)}–${weekdayShort(sorted[sorted.length - 1] - 1)}`;
  return sorted.map((d) => weekdayShort(d - 1)).join(', ');
}

const parityNote = (b: RoutineBlock) => (b.week_parity === 'odd' ? t(', nepárny') : b.week_parity === 'even' ? t(', párny') : '');

export function RoutinePage() {
  const { routine_blocks, profile } = useData();
  const editor = useEditor();
  const routineColor = useRoutineColor();
  const narrow = useMediaQuery('(max-width: 760px)');
  const week = useMemo(() => weekDays(weekStart(new Date())), []);
  const [dayIdx, setDayIdx] = useState(() => isoWeekday(new Date()) - 1);
  const days = useMemo(() => (narrow ? [week[dayIdx]] : week), [narrow, week, dayIdx]);
  const current = profile ? weekParity(new Date(), profile.odd_week_anchor) : 'odd';
  const [shown, setShown] = useState<'odd' | 'even'>(current);
  const { items, bands } = useCalendarItems(days, { routineOnly: true, parity: shown });
  const dayStartHour = profile ? Math.floor(timeToMinutes(profile.day_start) / 60) : 7;

  const grouped = (Object.keys(ROUTINE_KINDS) as RoutineKind[])
    .map((k) => ({ kind: k, blocks: routine_blocks.filter((b) => b.kind === k) }))
    .filter((g) => g.blocks.length > 0);

  return (
    <div className="page page-routine">
      <header className="toolbar">
        <div className="toolbar-nav">
          <h1 className="toolbar-title">{t('Rozvrh')}</h1>
          <div className="segmented small" role="radiogroup" aria-label={t('Zobrazený týždeň')}>
            {(['odd', 'even'] as const).map((p) => (
              <button key={p} role="radio" aria-checked={shown === p} onClick={() => setShown(p)}>
                {p === 'odd' ? t('Nepárny') : t('Párny')}
                {p === current ? ` (${t('teraz')})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={() => editor.editRoutine({})}>
            {t('Pridať blok')}
          </button>
          <button className="btn btn-primary" data-tour="class-grid" onClick={() => editor.editClassGrid('all')}>
            {t('Zapísať rozvrh hodín')}
          </button>
        </div>
      </header>
      <p className="lede">
        {t('Čo sa opakuje každý týždeň. Všetko mimo týchto blokov ({from}–{to}) je tvoj voľný čas na plánovanie. Autobusy pridávaš v Môj týždeň ako spoje.', {
          from: profile ? minutesToTime(timeToMinutes(profile.day_start)) : '7:00',
          to: profile ? minutesToTime(timeToMinutes(profile.day_end)) : '22:00',
        })}
      </p>
      {narrow && (
        <div className="weekday-picker" role="radiogroup" aria-label={t('Deň')}>
          {weekdaysShort().map((d, i) => (
            <button key={d} role="radio" aria-checked={dayIdx === i} onClick={() => setDayIdx(i)}>
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="routine-layout">
        <section className="week-grid">
          <TimeGrid
            days={days}
            items={items}
            bands={bands}
            generic
            scrollToHour={dayStartHour}
            onSwipe={narrow ? (dir) => setDayIdx((i) => (i + dir + 7) % 7) : undefined}
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
                {t('Zatiaľ prázdne. Začni tlačidlom')} <b>{t('Zapísať rozvrh hodín')}</b>
                {t(', vyplníš ho ako tabuľku v škole.')}
              </p>
            </div>
          )}
          {grouped.map((g) => (
            <section key={g.kind}>
              <h2>{ROUTINE_KINDS[g.kind].label}</h2>
              {g.kind === 'class' && (
                <div className="quick-row">
                  <button className="link-btn" onClick={() => editor.editClassGrid('all')}>
                    {t('Upraviť v tabuľke')}
                  </button>
                  <button className="link-btn" onClick={() => editor.editClassGrid('odd')}>
                    {t('len nepárny')}
                  </button>
                  <button className="link-btn" onClick={() => editor.editClassGrid('even')}>
                    {t('len párny')}
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
                          {b.valid_from && b.valid_until
                            ? t('platí od {from} do {to}', {
                                from: fmt(`${b.valid_from}T00:00`, 'd. M. yyyy'),
                                to: fmt(`${b.valid_until}T00:00`, 'd. M. yyyy'),
                              })
                            : b.valid_from
                              ? t('platí od {from}', { from: fmt(`${b.valid_from}T00:00`, 'd. M. yyyy') })
                              : t('platí do {to}', { to: fmt(`${b.valid_until}T00:00`, 'd. M. yyyy') })}
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
