import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { PRIORITY_LABELS, priorityColor } from '../lib/meta';
import { coveredMinutes, doneMinutes } from '../lib/planner';
import { fmtDuration, fromLocalInput, toLocalInput } from '../lib/time';
import type { Priority, Task } from '../lib/types';
import { CategorySelect, Field, Segmented } from './fields';

const ESTIMATES = [15, 30, 60, 90, 120, 180, 240];

export function TaskDialog({ initial, onClose }: { initial: Partial<Task>; onClose: () => void }) {
  const { insert, update, remove, profile, sessions, settleFinishedTask } = useData();
  const [title, setTitle] = useState(initial.title ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [categoryId, setCategoryId] = useState(initial.category_id ?? null);
  const [priority, setPriority] = useState<Priority>(initial.priority ?? 2);
  const [estimate, setEstimate] = useState(initial.estimated_minutes ?? 60);
  const [deadline, setDeadline] = useState(toLocalInput(initial.deadline ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = initial.id ? doneMinutes(initial.id, sessions) : 0;
  const covered = initial.id ? coveredMinutes(initial.id, sessions) : 0;

  const save = async (status?: Task['status']) => {
    if (!title.trim()) return setError('Doplň, čo treba urobiť.');
    if (!Number.isFinite(estimate) || estimate < 5) return setError('Odhad musí byť aspoň 5 minút.');
    const nextStatus = status ?? initial.status ?? 'todo';
    const row = {
      title: title.trim(),
      notes: notes.trim() || null,
      category_id: categoryId,
      priority,
      estimated_minutes: Math.round(estimate),
      deadline: fromLocalInput(deadline),
      status: nextStatus,
      completed_at: nextStatus === 'done' ? (initial.completed_at ?? new Date().toISOString()) : null,
    };
    setBusy(true);
    const ok = initial.id ? await update('tasks', initial.id, row) : Boolean(await insert('tasks', row));
    if (ok && initial.id && nextStatus === 'done') await settleFinishedTask(initial.id);
    setBusy(false);
    if (ok) onClose();
  };

  const del = async () => {
    if (initial.id && (await remove('tasks', initial.id))) onClose();
  };

  return (
    <Modal
      title={initial.id ? 'Upraviť úlohu' : 'Nová úloha'}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <button type="button" className="btn btn-danger-ghost" onClick={del}>
              Odstrániť
            </button>
          )}
          <span className="spacer" />
          {initial.id && initial.status !== 'done' && (
            <button type="button" className="btn btn-ghost" onClick={() => save('done')} disabled={busy}>
              Označiť ako hotové
            </button>
          )}
          {initial.status === 'done' && (
            <button type="button" className="btn btn-ghost" onClick={() => save('todo')} disabled={busy}>
              Vrátiť medzi otvorené
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => save()} disabled={busy}>
            {initial.id ? 'Uložiť zmeny' : 'Pridať úlohu'}
          </button>
        </>
      }
    >
      <Field label="Čo treba urobiť">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Napr. Referát z dejepisu"
          maxLength={200}
        />
      </Field>
      <Field label="Dôležitosť">
        <Segmented
          label="Dôležitosť"
          value={priority}
          onChange={setPriority}
          options={([1, 2, 3, 4] as Priority[]).map((p) => ({
            value: p,
            label: PRIORITY_LABELS[p],
            color: priorityColor(profile?.priority_colors, p),
          }))}
        />
      </Field>
      <Field label="Koľko času to zaberie" hint="Plánovač to rozdelí na bloky podľa nastavení.">
        <div className="estimate">
          <div className="chips">
            {ESTIMATES.map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                aria-pressed={estimate === m}
                onClick={() => setEstimate(m)}
              >
                {fmtDuration(m)}
              </button>
            ))}
          </div>
          <span className="estimate-custom">
            <input
              type="number"
              min={5}
              step={5}
              value={estimate}
              onChange={(e) => setEstimate(Number(e.target.value))}
              aria-label="Odhad v minútach"
            />
            min
          </span>
        </div>
      </Field>
      <div className="row-2">
        <Field label="Termín (dokedy)">
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <Field label="Kategória">
          <CategorySelect value={categoryId} onChange={setCategoryId} />
        </Field>
      </div>
      <Field label="Poznámka">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} />
      </Field>
      {initial.id && (
        <p className="muted small">
          Odpracované {fmtDuration(done)}, naplánované spolu {fmtDuration(covered)} z {fmtDuration(estimate)}.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
