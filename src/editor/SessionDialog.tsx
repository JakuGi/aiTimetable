import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { fmt, fmtDuration, fmtTime, fromLocalInput, toLocalInput } from '../lib/time';
import { sessionMinutes } from '../lib/planner';
import type { Session } from '../lib/types';
import { useGender } from '../lib/gender';

const STATUS_TEXT: Record<Session['status'], string> = {
  suggested: 'Návrh plánovača, zatiaľ neprijatý.',
  planned: 'Naplánované.',
  done: 'Hotovo.',
  skipped: 'Vynechané.',
};

export function SessionDialog({
  session,
  onClose,
  onOpenTask,
}: {
  session: Session;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { taskById, update, remove, setSessionStatus } = useData();
  const g = useGender();
  const task = taskById(session.task_id);
  const [start, setStart] = useState(toLocalInput(session.starts_at));
  const [end, setEnd] = useState(toLocalInput(session.ends_at));
  const [error, setError] = useState<string | null>(null);
  const title = session.kind === 'leisure' ? 'Voľný čas' : (task?.title ?? 'Práca na úlohe');
  const moved = start !== toLocalInput(session.starts_at) || end !== toLocalInput(session.ends_at);

  const act = async (status: Session['status']) => {
    if (moved) {
      const s = fromLocalInput(start);
      const e = fromLocalInput(end);
      if (!s || !e || e <= s) return setError('Koniec musí byť po začiatku.');
      if (!(await update('sessions', session.id, { starts_at: s, ends_at: e, status }))) return;
    } else if (!(await setSessionStatus([session.id], status))) return;
    onClose();
  };

  const del = async () => {
    if (await remove('sessions', session.id)) onClose();
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-danger-ghost" onClick={del}>
            {session.status === 'suggested' ? 'Zahodiť' : 'Odstrániť'}
          </button>
          <span className="spacer" />
          {session.status === 'suggested' && (
            <button type="button" className="btn btn-primary" onClick={() => act('planned')}>
              Prijať do plánu
            </button>
          )}
          {session.status === 'planned' && session.kind === 'task' && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => act('skipped')}>
                {g('Nestihol som', 'Nestihla som')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => act('done')}>
                Hotovo
              </button>
            </>
          )}
          {session.status === 'planned' && session.kind === 'leisure' && moved && (
            <button type="button" className="btn btn-primary" onClick={() => act('planned')}>
              Uložiť čas
            </button>
          )}
          {(session.status === 'done' || session.status === 'skipped') && (
            <button type="button" className="btn btn-ghost" onClick={() => act('planned')}>
              Vrátiť do plánu
            </button>
          )}
        </>
      }
    >
      <p className="session-when">
        {fmt(session.starts_at, 'EEEE d. M.')}, {fmtTime(session.starts_at)}–{fmtTime(session.ends_at)} (
        {fmtDuration(sessionMinutes(session))})
      </p>
      <p className="muted">{STATUS_TEXT[session.status]}</p>
      {task && (
        <button type="button" className="link-btn" onClick={() => onOpenTask(task.id)}>
          Otvoriť úlohu
        </button>
      )}
      <div className="row-2">
        <label className="field">
          <span className="field-label">Presunúť začiatok</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Koniec</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
