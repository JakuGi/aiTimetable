import { useState, type CSSProperties } from 'react';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { useToast } from '../components/Toast';
import { routineAppliesOn } from '../lib/planner';
import { useRoutineColor } from '../lib/useCalendarItems';
import { fmt, parseInput, toDateInput } from '../lib/time';
import { t } from '../lib/i18n';
import type { RoutineBlock } from '../lib/types';
import { Field } from './fields';

const short = (time: string) => time.slice(0, 5);
/** at most a long school break at once */
const MAX_DAYS = 62;

/** Marks and unmarks regular blocks (or whole days) as off. */
function useSkips() {
  const data = useData();
  const holiday = (day: Date) =>
    data.routine_skips.find((s) => s.routine_block_id === null && s.day === toDateInput(day)) ?? null;
  const skip = (r: RoutineBlock, day: Date) =>
    data.routine_skips.find((s) => s.routine_block_id === r.id && s.day === toDateInput(day)) ?? null;

  const toggle = async (r: RoutineBlock, day: Date) => {
    const s = skip(r, day);
    return s ? data.remove('routine_skips', s.id) : Boolean(await data.insert('routine_skips', { routine_block_id: r.id, day: toDateInput(day) }));
  };
  /** whole days off, from..until (inclusive); days already off are left as they are */
  const markDaysOff = (from: Date, until: Date, note: string | null) => {
    const count = Math.min(MAX_DAYS, Math.max(1, differenceInCalendarDays(until, from) + 1));
    const rows = Array.from({ length: count }, (_, i) => addDays(from, i))
      .filter((d) => !holiday(d))
      .map((d) => ({ routine_block_id: null, day: toDateInput(d), note }));
    return data.insertMany('routine_skips', rows);
  };
  const removeHoliday = (day: Date) => {
    const h = holiday(day);
    return h ? data.remove('routine_skips', h.id) : Promise.resolve(true);
  };
  return { holiday, skip, toggle, markDaysOff, removeHoliday };
}

/** One regular block on one day: it's off this time, or the whole day is a holiday. */
export function RoutineDayDialog({
  routine,
  day,
  onClose,
  onEdit,
  onDay,
}: {
  routine: RoutineBlock;
  day: Date;
  onClose: () => void;
  onEdit: () => void;
  onDay: () => void;
}) {
  const skips = useSkips();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const holiday = skips.holiday(day);
  const skipped = skips.skip(routine, day);

  const run = async (fn: () => Promise<boolean>, message: string) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) {
      notify(message, 'success');
      onClose();
    }
  };

  return (
    <Modal
      title={routine.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onEdit}>
            {t('Upraviť v rozvrhu')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Zavrieť')}
          </button>
        </>
      }
    >
      <p className="session-when">
        {fmt(day, 'EEEE d. M.')}, {short(routine.start_time)}–{short(routine.end_time)}
      </p>
      {holiday ? (
        <>
          <p className="muted">
            {holiday.note
              ? t('Celý deň je voľno ({name}), všetko z rozvrhu je prečiarknuté.', { name: holiday.note })
              : t('Celý deň je voľno, všetko z rozvrhu je prečiarknuté.')}
          </p>
          <div className="skip-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => run(() => skips.removeHoliday(day), t('Deň už nie je sviatok.'))}
            >
              {t('Zrušiť sviatok')}
            </button>
          </div>
        </>
      ) : skipped ? (
        <>
          <p className="muted">{t('V tento deň odpadá. Plánovač s týmto časom ráta ako s voľným.')}</p>
          <div className="skip-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => skips.toggle(routine, day), t('{title} predsa bude.', { title: routine.title }))}
            >
              {t('Predsa bude')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{t('Ak to tentoraz nebude, prečiarkni to. Pravidelný rozvrh ostane, zmena platí len pre tento deň.')}</p>
          <div className="skip-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => skips.toggle(routine, day), t('{title} v tento deň odpadá.', { title: routine.title }))}
            >
              {t('Odpadá (len tento deň)')}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onDay}>
              {t('Celý deň voľno (sviatok)…')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** A day: mark it (or a few days) as a holiday, or cross out single regular blocks. */
export function DayDialog({ day, onClose }: { day: Date; onClose: () => void }) {
  const data = useData();
  const skips = useSkips();
  const notify = useToast();
  const routineColor = useRoutineColor();
  const [note, setNote] = useState('');
  const [until, setUntil] = useState(toDateInput(day));
  const [busy, setBusy] = useState(false);
  const holiday = skips.holiday(day);
  const anchor = data.profile?.odd_week_anchor ?? '2024-01-01';
  const blocks = data.routine_blocks
    .filter((r) => routineAppliesOn(r, day, anchor))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const markOff = async () => {
    const end = until && until >= toDateInput(day) ? parseInput(until) : day;
    setBusy(true);
    const ok = await skips.markDaysOff(day, end, note.trim() || null);
    setBusy(false);
    if (!ok) return;
    const days = differenceInCalendarDays(end, day) + 1;
    notify(days > 1 ? t('Voľno na {n} dní. Hodiny z rozvrhu sú prečiarknuté.', { n: Math.min(days, MAX_DAYS) }) : t('Deň je sviatok. Hodiny z rozvrhu sú prečiarknuté.'), 'success');
    onClose();
  };

  return (
    <Modal
      title={fmt(day, 'EEEE d. MMMM')}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Zavrieť')}
          </button>
        </>
      }
    >
      {holiday ? (
        <section className="skip-holiday is-on">
          <p>
            <b>{holiday.note || t('Sviatok, voľno')}</b>
          </p>
          <p className="small muted">{t('Všetko z rozvrhu je v tento deň prečiarknuté a plánovač ten čas berie ako voľný.')}</p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await skips.removeHoliday(day)) notify(t('Deň už nie je sviatok.'), 'success');
              setBusy(false);
            }}
          >
            {t('Zrušiť sviatok')}
          </button>
        </section>
      ) : (
        <section className="skip-holiday">
          <h3>{t('Sviatok alebo voľno')}</h3>
          <p className="small muted">{t('Prečiarkne všetko z rozvrhu v tento deň (alebo až do zvoleného dňa, napr. prázdniny).')}</p>
          <div className="row-2">
            <Field label={t('Názov (nepovinné)')}>
              <input
                value={note}
                maxLength={120}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('napr. Štátny sviatok, jesenné prázdniny')}
              />
            </Field>
            <Field label={t('Až do (vrátane)')}>
              <input type="date" value={until} min={toDateInput(day)} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={markOff}>
            {t('Označiť ako sviatok')}
          </button>
        </section>
      )}

      {blocks.length > 0 && (
        <section className="skip-blocks">
          <h3>{t('Z rozvrhu v tento deň')}</h3>
          <ul>
            {blocks.map((r) => {
              const off = Boolean(holiday) || Boolean(skips.skip(r, day));
              return (
                <li key={r.id} style={{ '--c': routineColor(r) } as CSSProperties}>
                  <label className={off ? 'is-off' : undefined}>
                    <input
                      type="checkbox"
                      checked={off}
                      disabled={Boolean(holiday) || busy}
                      onChange={async () => {
                        setBusy(true);
                        await skips.toggle(r, day);
                        setBusy(false);
                      }}
                    />
                    <span className="skip-time">
                      {short(r.start_time)}–{short(r.end_time)}
                    </span>
                    <span className="skip-title">{r.title}</span>
                    <span className="small muted">{off ? t('odpadá') : ''}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {!holiday && <p className="small muted">{t('Zaškrtni, čo v tento deň odpadá.')}</p>}
        </section>
      )}
    </Modal>
  );
}
