import { useMemo, useState } from 'react';
import { addHours } from 'date-fns';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { useEditor } from './Editor';
import {
  expensePresets,
  FREELANCE_CATEGORY,
  FREELANCE_COLOR,
  GIG_MODES,
  GIG_STATUS,
  fmtMoney,
  gigEarnings,
  gigExpenses,
  gigHours,
  newExpenseId,
  num,
} from '../lib/freelance';
import { fmtDuration, fromLocalInput, toLocalInput } from '../lib/time';
import type { Gig, GigExpense, GigMode, GigStatus } from '../lib/types';
import { Field, Segmented } from './fields';
import { t } from '../lib/i18n';

const MINUTE_CHIPS = [0, 15, 30, 60];

export function GigDialog({ initial, onClose }: { initial: Partial<Gig>; onClose: () => void }) {
  const { insert, update, remove, categories, profile, sessions, tasks, settleFinishedTask } = useData();
  const editor = useEditor();
  const now = new Date();
  const defaultStart = initial.starts_at ? new Date(initial.starts_at) : addHours(new Date(now.setMinutes(0, 0, 0)), 24);

  const [mode, setMode] = useState<GigMode>(initial.mode ?? profile?.freelance_default_mode ?? 'event');
  const [title, setTitle] = useState(initial.title ?? '');
  const [client, setClient] = useState(initial.client ?? '');
  const [contact, setContact] = useState(initial.contact ?? '');
  const [status, setStatus] = useState<GigStatus>(initial.status ?? 'planned');
  const [starts, setStarts] = useState(toLocalInput(defaultStart));
  const [ends, setEnds] = useState(toLocalInput(initial.ends_at ? new Date(initial.ends_at) : addHours(defaultStart, 4)));
  const [location, setLocation] = useState(initial.location ?? '');
  const [prep, setPrep] = useState(initial.prep_minutes ?? 30);
  const [travel, setTravel] = useState(initial.travel_minutes ?? 30);
  const [prepNotes, setPrepNotes] = useState(initial.prep_notes ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(initial.deadline ?? null));
  const [estimateH, setEstimateH] = useState(initial.estimated_minutes ? String(initial.estimated_minutes / 60) : '4');
  const [planWork, setPlanWork] = useState(initial.id ? Boolean(initial.task_id) : true);
  const [payType, setPayType] = useState<'fixed' | 'hourly'>(initial.pay_type ?? 'fixed');
  const [payAmount, setPayAmount] = useState(initial.pay_amount !== undefined ? String(num(initial.pay_amount)) : '');
  const [hours, setHours] = useState(initial.hours !== undefined && initial.hours !== null ? String(num(initial.hours)) : '');
  const [expenses, setExpenses] = useState<GigExpense[]>(initial.expenses ?? []);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isEvent = mode === 'event';

  // a draft gig for live money totals
  const draft = useMemo(
    () =>
      ({
        ...initial,
        mode,
        status,
        starts_at: isEvent ? fromLocalInput(starts) : null,
        ends_at: isEvent ? fromLocalInput(ends) : null,
        estimated_minutes: Math.round(num(estimateH) * 60) || null,
        pay_type: payType,
        pay_amount: num(payAmount),
        hours: hours === '' ? null : num(hours),
        expenses,
      }) as Gig,
    [initial, mode, status, isEvent, starts, ends, estimateH, payType, payAmount, hours, expenses],
  );
  const earned = gigEarnings(draft, sessions);
  const spent = gigExpenses(draft);
  const hoursInfo = gigHours(draft, sessions);

  const setExpense = (id: string, patch: Partial<GigExpense>) =>
    setExpenses((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addExpense = (label = '') => setExpenses((xs) => [...xs, { id: newExpenseId(), label, amount: 0 }]);

  /** Freelance work gets its own category so it stands out in every view. */
  const freelanceCategory = async () => {
    const existing = categories.find((c) => c.name === FREELANCE_CATEGORY);
    if (existing) return existing.id;
    const created = await insert('categories', {
      name: FREELANCE_CATEGORY,
      color: FREELANCE_COLOR,
      sort_order: categories.length,
    });
    return created?.id ?? null;
  };

  const save = async () => {
    if (!title.trim()) return setError(t('Doplň, o akú akciu alebo projekt ide.'));
    const startsAt = fromLocalInput(starts);
    const endsAt = fromLocalInput(ends);
    if (isEvent && (!startsAt || !endsAt || endsAt <= startsAt)) return setError(t('Koniec akcie musí byť po začiatku.'));
    if (!isEvent && planWork && !(num(estimateH) > 0)) return setError(t('Na plánovanie práce zadaj odhad hodín.'));
    if (num(payAmount) < 0) return setError(t('Odmena nemôže byť záporná.'));

    setBusy(true);
    const categoryId = await freelanceCategory();
    const finished = status === 'done' || status === 'paid' || status === 'cancelled';

    // project work goes to the planner as a linked task
    let taskId = initial.task_id ?? null;
    const wantTask = !isEvent && planWork;
    if (wantTask) {
      const taskRow = {
        title: `Freelance: ${title.trim()}`,
        estimated_minutes: Math.max(5, Math.round(num(estimateH) * 60)),
        deadline: fromLocalInput(deadline),
        category_id: categoryId,
        status: finished ? ('done' as const) : ('todo' as const),
        completed_at: finished ? new Date().toISOString() : null,
      };
      if (taskId && tasks.some((t) => t.id === taskId)) await update('tasks', taskId, taskRow);
      else taskId = (await insert('tasks', { ...taskRow, priority: 3 }))?.id ?? null;
      if (taskId && finished) await settleFinishedTask(taskId);
    } else if (taskId) {
      await remove('tasks', taskId);
      taskId = null;
    }

    const row = {
      title: title.trim(),
      mode,
      client: client.trim() || null,
      contact: contact.trim() || null,
      status,
      starts_at: isEvent ? startsAt : null,
      ends_at: isEvent ? endsAt : null,
      location: location.trim() || null,
      prep_minutes: isEvent ? Math.max(0, Math.round(prep)) : 0,
      travel_minutes: isEvent ? Math.max(0, Math.round(travel)) : 0,
      prep_notes: prepNotes.trim() || null,
      deadline: isEvent ? null : fromLocalInput(deadline),
      estimated_minutes: isEvent ? null : Math.round(num(estimateH) * 60) || null,
      task_id: taskId,
      pay_type: payType,
      pay_amount: Math.round(num(payAmount) * 100) / 100,
      hours: hours === '' ? null : num(hours),
      expenses: expenses
        .filter((e) => e.label.trim() || num(e.amount) > 0)
        .map((e) => ({ ...e, label: e.label.trim() || t('Výdavok'), amount: Math.round(num(e.amount) * 100) / 100 })),
      paid_at: status === 'paid' ? (initial.paid_at ?? new Date().toISOString()) : null,
      notes: notes.trim() || null,
    };
    const ok = initial.id ? await update('gigs', initial.id, row) : Boolean(await insert('gigs', row));
    setBusy(false);
    if (ok) onClose();
  };

  const del = async () => {
    if (!initial.id) return;
    if (initial.task_id) await remove('tasks', initial.task_id);
    if (await remove('gigs', initial.id)) onClose();
  };

  // same client and setup again (gigs often repeat): a fresh copy without the link and payment
  const duplicate = () =>
    editor.editGig({ ...initial, id: undefined, task_id: null, paid_at: null, status: 'planned' });

  return (
    <Modal
      title={initial.id ? t('Upraviť freelance') : t('Nová freelance práca')}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={del}>
              {t('Odstrániť')}
            </button>
          )}
          {initial.id && (
            <button type="button" className="link-btn" onClick={duplicate}>
              {t('Duplikovať')}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {initial.id ? t('Uložiť zmeny') : t('Pridať')}
          </button>
        </>
      }
    >
      <Segmented
        label={t('Druh')}
        value={mode}
        onChange={setMode}
        options={(Object.keys(GIG_MODES) as GigMode[]).map((m) => ({ value: m, label: GIG_MODES[m].label }))}
      />
      <p className="small muted gig-mode-hint">{GIG_MODES[mode].hint}</p>

      <Field label={isEvent ? t('Čo za akciu') : t('Projekt')}>
        <input
          autoFocus={!initial.id}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isEvent ? t('Napr. Stavanie pódia na koncert') : t('Napr. Web pre kaviareň')}
          maxLength={200}
        />
      </Field>
      <div className="row-2">
        <Field label={t('Klient / agentúra')}>
          <input value={client} onChange={(e) => setClient(e.target.value)} maxLength={200} />
        </Field>
        <Field label={t('Kontakt')}>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('Telefón, e-mail')} maxLength={200} />
        </Field>
      </div>
      <Field label={t('Stav')}>
        <select value={status} onChange={(e) => setStatus(e.target.value as GigStatus)}>
          {(Object.keys(GIG_STATUS) as GigStatus[]).map((s) => (
            <option key={s} value={s}>
              {GIG_STATUS[s]}
            </option>
          ))}
        </select>
      </Field>

      {isEvent ? (
        <section className="gig-section">
          <h3>{t('Kedy a kde')}</h3>
          <div className="row-2">
            <Field label={t('Začiatok')}>
              <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </Field>
            <Field label={t('Koniec')}>
              <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </Field>
          </div>
          <Field label={t('Miesto')}>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('Adresa alebo miesto akcie')} maxLength={200} />
          </Field>
          <MinutesField label={t('Cesta tam (rovnako dlho aj späť)')} value={travel} onChange={setTravel} />
          <MinutesField label={t('Príprava pred akciou')} value={prep} onChange={setPrep} />
          <Field label={t('Čo si pripraviť')} hint={t('Pracovné rukavice, oblečenie, doklady… Plánovač nechá čas na prípravu aj cestu voľný.')}>
            <textarea value={prepNotes} onChange={(e) => setPrepNotes(e.target.value)} rows={2} maxLength={5000} />
          </Field>
        </section>
      ) : (
        <section className="gig-section">
          <h3>{t('Termín a práca')}</h3>
          <div className="row-2">
            <Field label={t('Odovzdať do')}>
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            <Field label={t('Odhad práce (hodiny)')}>
              <input type="number" min={0} step={0.5} value={estimateH} onChange={(e) => setEstimateH(e.target.value)} />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={planWork} onChange={(e) => setPlanWork(e.target.checked)} />
            {t('Naplánovať prácu do rozvrhu (plánovač nájde čas ako pri úlohe)')}
          </label>
          <Field label={t('Čo treba pripraviť alebo dodať')}>
            <textarea value={prepNotes} onChange={(e) => setPrepNotes(e.target.value)} rows={2} maxLength={5000} />
          </Field>
        </section>
      )}

      <section className="gig-section">
        <h3>{t('Peniaze')}</h3>
        <Segmented
          label={t('Odmena')}
          value={payType}
          onChange={setPayType}
          options={[
            { value: 'fixed', label: isEvent ? t('Za akciu') : t('Za projekt') },
            { value: 'hourly', get label() { return t('Na hodinu'); } },
          ]}
        />
        <div className="row-2">
          <Field label={payType === 'fixed' ? t('Odmena (€)') : t('Hodinová sadzba (€/h)')}>
            <input type="number" min={0} step={0.5} inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </Field>
          {payType === 'hourly' && (
            <Field
              label={t('Odpracované hodiny')}
              hint={
                hours === ''
                  ? t('Prázdne = {what} ({time}).', {
                      what: hoursInfo.source === 'tracked' ? t('odpracované bloky') : isEvent ? t('dĺžka akcie') : t('odhad'),
                      time: fmtDuration(hoursInfo.hours * 60),
                    })
                  : undefined
              }
            >
              <input type="number" min={0} step={0.25} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="field">
          <span className="field-label">{t('Výdavky')}</span>
          {expenses.length > 0 && (
            <ul className="expenses">
              {expenses.map((x) => (
                <li key={x.id}>
                  <input
                    value={x.label}
                    onChange={(e) => setExpense(x.id, { label: e.target.value })}
                    placeholder={t('Za čo')}
                    aria-label={t('Za čo')}
                    maxLength={80}
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    inputMode="decimal"
                    value={x.amount || ''}
                    onChange={(e) => setExpense(x.id, { amount: num(e.target.value) })}
                    placeholder="€"
                    aria-label={t('Suma v eurách')}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setExpenses((xs) => xs.filter((y) => y.id !== x.id))}
                    aria-label={t('Odstrániť {what}', { what: x.label || t('výdavok') })}
                  >
                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="chips">
            {expensePresets().map((p) => (
              <button key={p} type="button" className="chip" onClick={() => addExpense(p)}>
                + {p}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => addExpense()}>
              {t('+ Iné')}
            </button>
          </div>
        </div>

        <dl className="gig-sum">
          <div>
            <dt>{t('Zárobok')}</dt>
            <dd>{fmtMoney(earned)}</dd>
          </div>
          <div>
            <dt>{t('Výdavky')}</dt>
            <dd>−{fmtMoney(spent)}</dd>
          </div>
          <div className="is-net">
            <dt>{t('Čistý zisk')}</dt>
            <dd className={earned - spent < 0 ? 'is-loss' : undefined}>{fmtMoney(earned - spent)}</dd>
          </div>
        </dl>
      </section>

      <Field label={t('Poznámka')}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={5000} />
      </Field>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function MinutesField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="minutes-row">
        {MINUTE_CHIPS.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={value === m} onClick={() => onChange(m)}>
            {m === 0 ? t('nič') : fmtDuration(m)}
          </button>
        ))}
        <span className="minutes-custom">
          <input
            type="number"
            min={0}
            max={1440}
            step={5}
            value={value}
            onChange={(e) => onChange(Math.max(0, Math.min(1440, num(e.target.value))))}
            aria-label={t('{label} v minútach', { label })}
          />
          min
        </span>
      </div>
    </div>
  );
}
