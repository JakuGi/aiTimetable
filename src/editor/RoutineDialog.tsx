import { useState } from 'react';
import { Modal } from '../components/Modal';
import { ColorSwatches } from '../components/ColorSwatches';
import { useData } from '../lib/data';
import { ROUTINE_KINDS } from '../lib/meta';
import { WEEKDAY_SHORT, timeToMinutes } from '../lib/time';
import type { RoutineBlock, RoutineKind } from '../lib/types';
import { CategorySelect, Field, Segmented } from './fields';

const short = (t?: string) => (t ? t.slice(0, 5) : '');

export function RoutineDialog({ initial, onClose }: { initial: Partial<RoutineBlock>; onClose: () => void }) {
  const { insert, update, remove } = useData();
  const [title, setTitle] = useState(initial.title ?? '');
  const [kind, setKind] = useState<RoutineKind>(initial.kind ?? 'class');
  const [days, setDays] = useState<number[]>(initial.weekdays ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(short(initial.start_time) || '08:00');
  const [end, setEnd] = useState(short(initial.end_time) || '09:00');
  const [location, setLocation] = useState(initial.location ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [categoryId, setCategoryId] = useState(initial.category_id ?? null);
  const [color, setColor] = useState(initial.color ?? null);
  const [validFrom, setValidFrom] = useState(initial.valid_from ?? '');
  const [validUntil, setValidUntil] = useState(initial.valid_until ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const save = async () => {
    if (!title.trim()) return setError('Doplň názov.');
    if (!days.length) return setError('Vyber aspoň jeden deň.');
    if (timeToMinutes(end) <= timeToMinutes(start)) return setError('Koniec musí byť po začiatku.');
    if (validFrom && validUntil && validUntil < validFrom) return setError('Platnosť "do" musí byť po "od".');
    const row = {
      title: title.trim(),
      kind,
      weekdays: days,
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
    if (ok) onClose();
  };

  const del = async () => {
    if (initial.id && (await remove('routine_blocks', initial.id))) onClose();
  };

  return (
    <Modal
      title={initial.id ? 'Upraviť pravidelný blok' : 'Pridať do môjho týždňa'}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={del}>
              Odstrániť
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Zrušiť
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {initial.id ? 'Uložiť zmeny' : 'Pridať'}
          </button>
        </>
      }
    >
      <Segmented
        label="Druh"
        value={kind}
        onChange={setKind}
        options={(Object.keys(ROUTINE_KINDS) as RoutineKind[]).map((k) => ({
          value: k,
          label: ROUTINE_KINDS[k].label,
          color: ROUTINE_KINDS[k].color,
        }))}
      />
      <Field label="Názov">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'commute' ? 'Napr. Bus do školy' : kind === 'class' ? 'Napr. Matematika' : 'Napr. Futbal'}
          maxLength={120}
        />
      </Field>
      <div className="field">
        <span className="field-label">Ktoré dni</span>
        <div className="days-picker" role="group" aria-label="Dni v týždni">
          {WEEKDAY_SHORT.map((label, i) => (
            <button key={label} type="button" aria-pressed={days.includes(i + 1)} onClick={() => toggleDay(i + 1)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="row-2">
        <Field label={kind === 'commute' ? 'Odchod' : 'Od'}>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} step={300} />
        </Field>
        <Field label={kind === 'commute' ? 'Príchod' : 'Do'}>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} step={300} />
        </Field>
      </div>
      <Field label={kind === 'commute' ? 'Spoj a zastávky' : 'Miesto'}>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={kind === 'commute' ? 'Napr. Bus 23 z Hlavnej, nástupište 4' : 'Napr. učebňa 204'}
          maxLength={200}
        />
      </Field>
      <Field label="Poznámka">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
      </Field>
      <div className="row-2">
        <Field label="Kategória">
          <CategorySelect value={categoryId} onChange={setCategoryId} />
        </Field>
        <Field label="Farba">
          <ColorSwatches label="Farba" value={color} onChange={setColor} allowNone="Podľa druhu alebo kategórie" />
        </Field>
      </div>
      <div className="row-2">
        <Field label="Platí od" hint="Napr. začiatok semestra. Nechaj prázdne, ak platí stále.">
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Field label="Platí do">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
