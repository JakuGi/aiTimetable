import { useState } from 'react';
import { Modal } from '../components/Modal';
import { ColorSwatches } from '../components/ColorSwatches';
import { useData } from '../lib/data';
import { DEFAULT_CLASS_PERIODS, PARITY_LABELS, ROUTINE_KINDS } from '../lib/meta';
import { weekdaysShort, timeToMinutes } from '../lib/time';
import type { RoutineBlock, RoutineKind, WeekParity } from '../lib/types';
import { CategorySelect, Field, Segmented } from './fields';
import { t } from '../lib/i18n';

const short = (t?: string) => (t ? t.slice(0, 5) : '');

export function RoutineDialog({ initial, onClose }: { initial: Partial<RoutineBlock>; onClose: () => void }) {
  const { insert, update, remove, profile, categories, routine_blocks } = useData();
  const periods = profile?.class_periods?.length ? profile.class_periods : DEFAULT_CLASS_PERIODS;
  const schoolCategory = categories.find((c) => c.name === 'Škola')?.id ?? null;

  const [title, setTitle] = useState(initial.title ?? '');
  const [kind, setKind] = useState<RoutineKind>(initial.kind ?? 'class');
  const [days, setDays] = useState<number[]>(initial.weekdays ?? [1, 2, 3, 4, 5]);
  const [parity, setParity] = useState<WeekParity>(initial.week_parity ?? 'all');
  const [start, setStart] = useState(short(initial.start_time) || '08:00');
  const [end, setEnd] = useState(short(initial.end_time) || '08:45');
  const [location, setLocation] = useState(initial.location ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [categoryId, setCategoryId] = useState(
    initial.id ? (initial.category_id ?? null) : (initial.category_id ?? schoolCategory),
  );
  const [color, setColor] = useState(initial.color ?? null);
  const [validFrom, setValidFrom] = useState(initial.valid_from ?? '');
  const [validUntil, setValidUntil] = useState(initial.valid_until ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // subjects already used, offered as suggestions while typing
  const knownTitles = [...new Set(routine_blocks.filter((b) => b.kind === kind).map((b) => b.title))].sort();

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  // which bell periods the current start/end covers
  const startIdx = periods.findIndex((p) => p.start === start);
  const endIdx = periods.findIndex((p) => p.end === end);
  const coversPeriod = (i: number) => startIdx !== -1 && endIdx !== -1 && i >= startIdx && i <= endIdx;

  /** Click a period: select it; shift-click or a neighbour extends the range (double periods). */
  const pickPeriod = (i: number, extend: boolean) => {
    if (extend && startIdx !== -1 && endIdx !== -1) {
      setStart(periods[Math.min(i, startIdx)].start);
      setEnd(periods[Math.max(i, endIdx)].end);
    } else {
      setStart(periods[i].start);
      setEnd(periods[i].end);
    }
  };

  const changeKind = (k: RoutineKind) => {
    setKind(k);
    if (!initial.id && categoryId === schoolCategory && k !== 'class') setCategoryId(null);
    if (!initial.id && k === 'class' && categoryId === null) setCategoryId(schoolCategory);
  };

  const save = async (andNext = false) => {
    if (!title.trim()) return setError(t('Doplň názov.'));
    if (!days.length) return setError(t('Vyber aspoň jeden deň.'));
    if (timeToMinutes(end) <= timeToMinutes(start)) return setError(t('Koniec musí byť po začiatku.'));
    if (validFrom && validUntil && validUntil < validFrom) return setError(t('Platnosť "do" musí byť po "od".'));
    const row = {
      title: title.trim(),
      kind,
      weekdays: days,
      week_parity: parity,
      start_time: start,
      end_time: end,
      location: location.trim() || null,
      notes: notes.trim() || null,
      category_id: categoryId,
      color,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
    };
    setBusy(true);
    const ok = initial.id
      ? await update('routine_blocks', initial.id, row)
      : Boolean(await insert('routine_blocks', row));
    setBusy(false);
    if (!ok) return;
    if (!andNext) return onClose();

    // keep kind, days, parity and validity; move to the next period
    setError(null);
    setTitle('');
    setLocation('');
    setNotes('');
    if (endIdx !== -1 && endIdx + 1 < periods.length) {
      setStart(periods[endIdx + 1].start);
      setEnd(periods[endIdx + 1].end);
    }
  };

  const del = async () => {
    if (initial.id && (await remove('routine_blocks', initial.id))) onClose();
  };

  return (
    <Modal
      title={initial.id ? t('Upraviť pravidelný blok') : t('Pridať do rozvrhu')}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={del}>
              {t('Odstrániť')}
            </button>
          )}
          <span className="spacer" />
          {!initial.id && (
            <button type="button" className="btn btn-ghost" onClick={() => save(true)} disabled={busy}>
              {t('Uložiť a pridať ďalší')}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => save()} disabled={busy}>
            {initial.id ? t('Uložiť zmeny') : t('Pridať')}
          </button>
        </>
      }
    >
      <Segmented
        label={t('Druh')}
        value={kind}
        onChange={changeKind}
        options={(Object.keys(ROUTINE_KINDS) as RoutineKind[]).map((k) => ({
          value: k,
          label: ROUTINE_KINDS[k].label,
          color: ROUTINE_KINDS[k].color,
        }))}
      />
      <Field label={kind === 'class' ? t('Predmet') : t('Názov')}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'class' ? t('Napr. Matematika') : kind === 'work' ? t('Napr. Brigáda v kaviarni') : t('Napr. Futbal')}
          maxLength={120}
          list="routine-titles"
        />
        <datalist id="routine-titles">
          {knownTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <div className="field">
        <span className="field-label">{t('Ktoré dni')}</span>
        <div className="days-picker" role="group" aria-label={t('Dni v týždni')}>
          {weekdaysShort().map((label, i) => (
            <button key={label} type="button" aria-pressed={days.includes(i + 1)} onClick={() => toggleDay(i + 1)}>
              {label}
            </button>
          ))}
        </div>
        <div className="quick-row">
          <button type="button" className="link-btn" onClick={() => setDays([1, 2, 3, 4, 5])}>
            {t('Po–Pi')}
          </button>
          <button type="button" className="link-btn" onClick={() => setDays([6, 7])}>
            {t('Víkend')}
          </button>
          <button type="button" className="link-btn" onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>
            {t('Každý deň')}
          </button>
        </div>
      </div>
      <Field label={t('Ktoré týždne')}>
        <Segmented
          label={t('Ktoré týždne')}
          value={parity}
          onChange={setParity}
          options={(['all', 'odd', 'even'] as WeekParity[]).map((p) => ({ value: p, label: PARITY_LABELS[p] }))}
        />
      </Field>
      {kind === 'class' && (
        <div className="field">
          <span className="field-label">{t('Hodina podľa zvonenia')}</span>
          <div className="periods" role="group" aria-label={t('Vyučovacie hodiny')}>
            {periods.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={coversPeriod(i)}
                onClick={(e) => pickPeriod(i, e.shiftKey || (startIdx !== -1 && (i === startIdx - 1 || i === endIdx + 1)))}
                title={`${p.start}–${p.end}`}
              >
                <b>{i + 1}.</b>
                <span>{p.start}</span>
              </button>
            ))}
          </div>
          <span className="field-hint">
            {t('Klikni na hodinu. Susedná hodina pridá dvojhodinovku. Časy zvonenia zmeníš v Nastaveniach.')}
          </span>
        </div>
      )}
      <div className="row-2">
        <Field label={t('Od')}>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} step={300} />
        </Field>
        <Field label={t('Do')}>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} step={300} />
        </Field>
      </div>
      <Field label={kind === 'class' ? t('Učebňa') : t('Miesto')}>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={kind === 'class' ? t('Napr. 204') : ''}
          maxLength={200}
        />
      </Field>
      <details className="more">
        <summary>{t('Ďalšie možnosti')}</summary>
        <Field label={t('Poznámka')}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </Field>
        <div className="row-2">
          <Field label={t('Kategória')}>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </Field>
          <Field label={t('Farba')}>
            <ColorSwatches label={t('Farba')} value={color} onChange={setColor} allowNone={t('Podľa druhu alebo kategórie')} />
          </Field>
        </div>
        <div className="row-2">
          <Field label={t('Platí od')} hint={t('Napr. začiatok polroka. Prázdne = platí stále.')}>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Field label={t('Platí do')}>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>
      </details>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
