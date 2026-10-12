import { useState } from 'react';
import { addHours, endOfDay, startOfDay } from 'date-fns';
import { Modal } from '../components/Modal';
import { ColorSwatches } from '../components/ColorSwatches';
import { useData } from '../lib/data';
import { EVENT_KINDS, REMIND_OPTIONS } from '../lib/meta';
import { fmt, fromLocalInput, parseInput, toDateInput, toLocalInput } from '../lib/time';
import type { CalendarEvent, EventKind } from '../lib/types';
import { CategorySelect, Field, Segmented } from './fields';

export function EventDialog({ initial, onClose }: { initial: Partial<CalendarEvent>; onClose: () => void }) {
  const { insert, update, remove, event_templates } = useData();
  const start0 = initial.starts_at ? new Date(initial.starts_at) : new Date();
  const [title, setTitle] = useState(initial.title ?? '');
  const [kind, setKind] = useState<EventKind>(initial.kind ?? 'event');
  const [allDay, setAllDay] = useState(initial.all_day ?? false);
  const [starts, setStarts] = useState(allDay ? toDateInput(start0) : toLocalInput(start0));
  const [ends, setEnds] = useState(() => {
    const e = initial.ends_at ? new Date(initial.ends_at) : addHours(start0, 1);
    return allDay ? toDateInput(e) : toLocalInput(e);
  });
  const [location, setLocation] = useState(initial.location ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [categoryId, setCategoryId] = useState(initial.category_id ?? null);
  const [color, setColor] = useState(initial.color ?? null);
  const [remind, setRemind] = useState<number | null>(
    initial.remind_minutes_before !== undefined ? initial.remind_minutes_before : null,
  );
  const [blocks, setBlocks] = useState(initial.blocks_planning ?? true);
  const [asTemplate, setAsTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isReminder = kind === 'reminder';

  const changeKind = (k: EventKind) => {
    setKind(k);
    if (k === 'reminder') {
      setBlocks(false);
      if (remind === null) setRemind(0);
    } else if (kind === 'reminder') setBlocks(true);
  };

  const toggleAllDay = (on: boolean) => {
    setAllDay(on);
    const s = starts ? parseInput(starts) : new Date();
    const e = ends ? parseInput(ends) : s;
    setStarts(on ? toDateInput(s) : toLocalInput(addHours(startOfDay(s), 9)));
    setEnds(on ? toDateInput(e) : toLocalInput(addHours(startOfDay(s), 10)));
    if (on) setBlocks(false);
  };

  const save = async () => {
    if (!title.trim()) return setError('Doplň názov.');
    if (!starts) return setError('Doplň začiatok.');
    let startsAt: string;
    let endsAt: string | null = null;
    if (allDay) {
      startsAt = startOfDay(parseInput(starts)).toISOString();
      endsAt = endOfDay(parseInput(ends || starts)).toISOString();
    } else {
      startsAt = fromLocalInput(starts)!;
      endsAt = isReminder ? null : fromLocalInput(ends);
    }
    if (endsAt && endsAt < startsAt) return setError('Koniec musí byť po začiatku.');

    const row = {
      title: title.trim(),
      kind,
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: allDay,
      location: location.trim() || null,
      notes: notes.trim() || null,
      category_id: categoryId,
      color,
      remind_minutes_before: remind,
      blocks_planning: blocks,
    };
    setBusy(true);
    const ok = initial.id ? await update('events', initial.id, row) : Boolean(await insert('events', row));
    if (ok && asTemplate && endsAt && kind !== 'reminder') {
      await insert('event_templates', {
        title: row.title,
        kind: kind as 'event' | 'work' | 'commute' | 'leisure',
        start_time: fmt(startsAt, 'HH:mm'),
        end_time: fmt(endsAt, 'HH:mm'),
        location: row.location,
        notes: row.notes,
        category_id: categoryId,
        color,
        remind_minutes_before: remind,
      });
    }
    setBusy(false);
    if (ok) onClose();
  };

  const del = async () => {
    if (initial.id && (await remove('events', initial.id))) onClose();
  };

  return (
    <Modal
      title={initial.id ? 'Upraviť v kalendári' : 'Pridať do kalendára'}
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
        onChange={changeKind}
        options={(Object.keys(EVENT_KINDS) as EventKind[]).map((k) => ({
          value: k,
          label: EVENT_KINDS[k].label,
          color: EVENT_KINDS[k].color,
        }))}
      />
      <Field label="Názov">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isReminder ? 'Napr. Zobrať tenisky na telesnú' : kind === 'commute' ? 'Napr. Bus do školy' : 'Napr. Tréning'}
          maxLength={200}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
        Celý deň
      </label>
      <div className="row-2">
        <Field label={isReminder ? 'Kedy' : 'Začiatok'}>
          <input type={allDay ? 'date' : 'datetime-local'} value={starts} onChange={(e) => setStarts(e.target.value)} />
        </Field>
        {!isReminder && (
          <Field label="Koniec">
            <input type={allDay ? 'date' : 'datetime-local'} value={ends} onChange={(e) => setEnds(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label={kind === 'commute' ? 'Odkiaď, kam, číslo spoja' : 'Miesto'}>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={kind === 'commute' ? 'Napr. Bus 23, Hlavná stanica → Škola' : ''}
          maxLength={200}
        />
      </Field>
      <Field label="Poznámka">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={5000} />
      </Field>
      <div className="row-2">
        <Field label="Kategória">
          <CategorySelect value={categoryId} onChange={setCategoryId} />
        </Field>
        <Field label="Upozornenie">
          <select
            value={remind === null ? '' : String(remind)}
            onChange={(e) => setRemind(e.target.value === '' ? null : Number(e.target.value))}
          >
            {REMIND_OPTIONS.map((o) => (
              <option key={String(o.value)} value={o.value === null ? '' : o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Farba">
        <ColorSwatches label="Farba" value={color} onChange={setColor} allowNone="Podľa kategórie" />
      </Field>
      {!isReminder && (
        <label className="check">
          <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} />
          Počas tohto času mi neplánuj úlohy
        </label>
      )}
      {!initial.id && !isReminder && !allDay && !event_templates.some((t) => t.title === title.trim()) && (
        <label className="check">
          <input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} />
          {kind === 'commute' ? 'Uložiť aj ako spoj, aby som ho nabudúce vložil jedným klikom' : 'Uložiť aj na rýchle pridávanie'}
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
