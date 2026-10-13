import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { fmt, fmtDuration, fromLocalInput, toLocalInput } from '../lib/time';
import type { FreeBlock } from '../lib/types';
import { Field } from './fields';

/** Free time drawn by hand: change its time, add a note, or give it back to planning. */
export function FreeBlockDialog({ block, onClose }: { block: FreeBlock; onClose: () => void }) {
  const { update, remove } = useData();
  const [start, setStart] = useState(toLocalInput(block.starts_at));
  const [end, setEnd] = useState(toLocalInput(block.ends_at));
  const [note, setNote] = useState(block.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const minutes = (new Date(block.ends_at).getTime() - new Date(block.starts_at).getTime()) / 60_000;

  const save = async () => {
    const s = fromLocalInput(start);
    const e = fromLocalInput(end);
    if (!s || !e || e <= s) return setError('Koniec musí byť po začiatku.');
    if (await update('free_blocks', block.id, { starts_at: s, ends_at: e, note: note.trim() || null })) onClose();
  };
  const del = async () => {
    if (await remove('free_blocks', block.id)) onClose();
  };

  return (
    <Modal
      title="Vyhradené voľno"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-danger-ghost" onClick={del}>
            Zrušiť voľno
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Zavrieť
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Uložiť
          </button>
        </>
      }
    >
      <p className="session-when">
        {fmt(block.starts_at, 'EEEE d. M.')}, {fmtDuration(minutes)}
      </p>
      <p className="muted small">
        Sem plánovač prácu nedá. Siahne sem až ako úplne posledné, keď by sa inak nestihol termín, a vtedy ti to povie.
      </p>
      <div className="row-2">
        <Field label="Od">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Do">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Poznámka (nepovinné)">
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="napr. tréning, hry s kamošmi" />
      </Field>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
