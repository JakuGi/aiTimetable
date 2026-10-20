import { useState } from 'react';
import { isBefore, startOfDay } from 'date-fns';
import { Modal } from '../components/Modal';
import { ColorSwatches } from '../components/ColorSwatches';
import { useData } from '../lib/data';
import { EVENT_KINDS, REMIND_OPTIONS } from '../lib/meta';
import { atMinutes, fmt, timeToMinutes, weekDays } from '../lib/time';
import type { CalendarEvent, EventTemplate, TemplateKind } from '../lib/types';
import { CategorySelect, Field, Segmented } from './fields';
import { t } from '../lib/i18n';

const short = (t?: string) => (t ? t.slice(0, 5) : '');
const TEMPLATE_KINDS: TemplateKind[] = ['commute', 'event', 'work', 'leisure'];

/** Create or edit a saved connection (bus, train) or another quick block. */
export function TemplateDialog({ initial, onClose }: { initial: Partial<EventTemplate>; onClose: () => void }) {
  const { insert, update, remove, categories } = useData();
  const travel = categories.find((c) => c.name === 'Cestovanie')?.id ?? null;
  const [title, setTitle] = useState(initial.title ?? '');
  const [kind, setKind] = useState<TemplateKind>(initial.kind ?? 'commute');
  const [start, setStart] = useState(short(initial.start_time) || '07:10');
  const [end, setEnd] = useState(short(initial.end_time) || '07:40');
  const [location, setLocation] = useState(initial.location ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [categoryId, setCategoryId] = useState(initial.id ? (initial.category_id ?? null) : travel);
  const [color, setColor] = useState(initial.color ?? null);
  const [remind, setRemind] = useState<number | null>(initial.remind_minutes_before ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return setError(t('Doplň názov, napr. „Bus do školy“.'));
    if (timeToMinutes(end) <= timeToMinutes(start)) return setError(t('Príchod musí byť po odchode.'));
    const row = {
      title: title.trim(),
      kind,
      start_time: start,
      end_time: end,
      location: location.trim() || null,
      notes: notes.trim() || null,
      category_id: categoryId,
      color,
      remind_minutes_before: remind,
    };
    setBusy(true);
    const ok = initial.id
      ? await update('event_templates', initial.id, row)
      : Boolean(await insert('event_templates', row));
    setBusy(false);
    if (ok) onClose();
  };

  const del = async () => {
    if (initial.id && (await remove('event_templates', initial.id))) onClose();
  };

  const isTrip = kind === 'commute';

  return (
    <Modal
      title={initial.id ? t('Upraviť spoj') : t('Nový spoj na rýchle pridávanie')}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={del}>
              {t('Odstrániť')}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Zrušiť')}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {initial.id ? t('Uložiť zmeny') : t('Uložiť spoj')}
          </button>
        </>
      }
    >
      <p className="small muted">
        {t('Spoj si uložíš raz a potom ho vkladáš len do tých dní, keď ho naozaj potrebuješ.')}
      </p>
      <Segmented
        label={t('Druh')}
        value={kind}
        onChange={setKind}
        options={TEMPLATE_KINDS.map((k) => ({ value: k, label: EVENT_KINDS[k].label, color: EVENT_KINDS[k].color }))}
      />
      <Field label={t('Názov')}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isTrip ? t('Napr. Bus do školy') : t('Napr. Tréning navyše')}
          maxLength={120}
        />
      </Field>
      <div className="row-2">
        <Field label={isTrip ? t('Odchod') : t('Od')}>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} step={60} />
        </Field>
        <Field label={isTrip ? t('Príchod') : t('Do')}>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} step={60} />
        </Field>
      </div>
      <Field label={isTrip ? t('Spoj a zastávky') : t('Miesto')}>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={isTrip ? t('Napr. Bus 23, Hlavná stanica → Školská') : ''}
          maxLength={200}
        />
      </Field>
      <div className="row-2">
        <Field label={t('Upozornenie')}>
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
        <Field label={t('Kategória')}>
          <CategorySelect value={categoryId} onChange={setCategoryId} />
        </Field>
      </div>
      <details className="more">
        <summary>{t('Ďalšie možnosti')}</summary>
        <Field label={t('Poznámka')}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </Field>
        <Field label={t('Farba')}>
          <ColorSwatches label={t('Farba')} value={color} onChange={setColor} allowNone={t('Podľa druhu alebo kategórie')} />
        </Field>
      </details>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

/** Is this template already placed on that day? (same title and departure) */
export function placedOn(t: EventTemplate, day: Date, events: CalendarEvent[]) {
  const at = atMinutes(day, timeToMinutes(t.start_time)).getTime();
  return events.find((e) => e.title === t.title && new Date(e.starts_at).getTime() === at);
}

/** Drop a saved connection into chosen days of one concrete week. */
export function PlaceTemplateDialog({
  template,
  weekStart,
  onClose,
  onEdit,
}: {
  template: EventTemplate;
  weekStart: Date;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { events, insertMany, remove } = useData();
  const days = weekDays(weekStart);
  const today = startOfDay(new Date());
  const existing = days.map((d) => placedOn(template, d, events));
  const [chosen, setChosen] = useState<boolean[]>(() => existing.map(Boolean));
  const [busy, setBusy] = useState(false);

  const toggle = (i: number) => setChosen((c) => c.map((v, j) => (j === i ? !v : v)));
  const setRange = (from: number, to: number) => setChosen(days.map((_, i) => i >= from && i <= to));

  const save = async () => {
    setBusy(true);
    const toAdd = days.filter((_, i) => chosen[i] && !existing[i]);
    const toRemove = existing.filter((e, i) => e && !chosen[i]) as CalendarEvent[];
    for (const e of toRemove) await remove('events', e.id);
    const ok = await insertMany(
      'events',
      toAdd.map((d) => ({
        title: template.title,
        kind: template.kind,
        starts_at: atMinutes(d, timeToMinutes(template.start_time)).toISOString(),
        ends_at: atMinutes(d, timeToMinutes(template.end_time)).toISOString(),
        all_day: false,
        location: template.location,
        notes: template.notes,
        category_id: template.category_id,
        color: template.color,
        remind_minutes_before: template.remind_minutes_before,
        blocks_planning: true,
      })),
    );
    setBusy(false);
    if (ok) onClose();
  };

  const changes = chosen.filter((v, i) => v !== Boolean(existing[i])).length;

  return (
    <Modal
      title={template.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="link-btn" onClick={onEdit}>
            {t('Upraviť spoj')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Zrušiť')}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || changes === 0}>
            {t('Uložiť do týždňa')}
          </button>
        </>
      }
    >
      <p className="session-when">
        {short(template.start_time)}–{short(template.end_time)}
        {template.location ? `, ${template.location}` : ''}
      </p>
      <p className="muted small">
        {t('Týždeň {from} – {to}. Vyber dni, kedy týmto spojom pôjdeš.', { from: fmt(days[0], 'd. M.'), to: fmt(days[6], 'd. M.') })}
      </p>
      <div className="place-days" role="group" aria-label={t('Dni')}>
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={chosen[i]}
            onClick={() => toggle(i)}
            className={isBefore(d, today) ? 'is-past' : undefined}
          >
            <span>{fmt(d, 'EEEEEE')}</span>
            <b>{fmt(d, 'd.')}</b>
          </button>
        ))}
      </div>
      <div className="quick-row">
        <button type="button" className="link-btn" onClick={() => setRange(0, 4)}>
          {t('Po–Pi')}
        </button>
        <button type="button" className="link-btn" onClick={() => setRange(0, 6)}>
          {t('Celý týždeň')}
        </button>
        <button type="button" className="link-btn" onClick={() => setRange(-1, -1)}>
          {t('Nič')}
        </button>
      </div>
      {existing.some(Boolean) && (
        <p className="small muted">{t('Zvýraznené dni už tento spoj majú. Zrušením výberu ho z daného dňa odstrániš.')}</p>
      )}
    </Modal>
  );
}
