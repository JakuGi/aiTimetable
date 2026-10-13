import { useState, type CSSProperties } from 'react';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { PRIORITY_LABELS, priorityColor } from '../lib/meta';
import { coveredMinutes, doneMinutes } from '../lib/planner';
import { fmt, fmtDuration, relativeDeadline } from '../lib/time';
import type { Task } from '../lib/types';
import { useToast } from '../components/Toast';

type Filter = 'todo' | 'done';
type Sort = 'deadline' | 'priority';

export function TasksPage() {
  const { tasks, sessions, profile, categoryById, update, settleFinishedTask } = useData();
  const editor = useEditor();
  const notify = useToast();
  const [filter, setFilter] = useState<Filter>('todo');
  const [sort, setSort] = useState<Sort>('deadline');

  const list = tasks
    .filter((t) => t.status === filter)
    .sort((a, b) => {
      if (filter === 'done') return (b.completed_at ?? '').localeCompare(a.completed_at ?? '');
      if (sort === 'priority') return b.priority - a.priority || cmpDeadline(a, b);
      return cmpDeadline(a, b) || b.priority - a.priority;
    });

  const toggle = async (t: Task) => {
    const done = t.status !== 'done';
    await update('tasks', t.id, {
      status: done ? 'done' : 'todo',
      completed_at: done ? new Date().toISOString() : null,
    });
    if (done) {
      await settleFinishedTask(t.id);
      notify(`Hotovo: ${t.title}`, 'success');
    }
  };

  const openCount = tasks.filter((t) => t.status === 'todo').length;

  return (
    <div className="page page-tasks">
      <header className="toolbar">
        <div className="toolbar-nav">
          <h1 className="toolbar-title">Úlohy</h1>
          <div className="segmented small" role="radiogroup" aria-label="Filter">
            <button role="radio" aria-checked={filter === 'todo'} onClick={() => setFilter('todo')}>
              Otvorené ({openCount})
            </button>
            <button role="radio" aria-checked={filter === 'done'} onClick={() => setFilter('done')}>
              Hotové
            </button>
          </div>
        </div>
        <div className="toolbar-actions">
          {filter === 'todo' && (
            <label className="inline-select">
              Zoradiť podľa
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="deadline">termínu</option>
                <option value="priority">dôležitosti</option>
              </select>
            </label>
          )}
          <button className="btn btn-primary" onClick={() => editor.editTask({})}>
            Nová úloha
          </button>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="empty-state">
          {filter === 'todo' ? (
            <>
              <h2>Nič otvorené</h2>
              <p>Zapíš si, čo potrebuješ stihnúť, odhadni čas a daj termín. Plánovač ti to rozloží do voľných chvíľ.</p>
              <button className="btn btn-primary" onClick={() => editor.editTask({})}>
                Pridať prvú úlohu
              </button>
            </>
          ) : (
            <p>Zatiaľ nič hotové.</p>
          )}
        </div>
      ) : (
        <ul className="task-list">
          {list.map((t) => {
            const color = priorityColor(profile?.priority_colors, t.priority);
            const done = doneMinutes(t.id, sessions);
            const covered = coveredMinutes(t.id, sessions);
            const cat = categoryById(t.category_id);
            const overdue = t.status === 'todo' && t.deadline && new Date(t.deadline) < new Date();
            return (
              <li key={t.id} className="task-row" style={{ '--c': color } as CSSProperties}>
                <input
                  type="checkbox"
                  className="task-check"
                  checked={t.status === 'done'}
                  onChange={() => toggle(t)}
                  aria-label={t.status === 'done' ? `Vrátiť ${t.title}` : `Hotovo: ${t.title}`}
                />
                <button className="task-main" onClick={() => editor.editTask(t)}>
                  <span className="task-title">{t.title}</span>
                  <span className="task-meta">
                    <span className="prio">{PRIORITY_LABELS[t.priority]}</span>
                    {cat && (
                      <span className="cat" style={{ '--cat': cat.color } as CSSProperties}>
                        {cat.name}
                      </span>
                    )}
                    {t.deadline && (
                      <span className={overdue ? 'deadline is-overdue' : 'deadline'}>
                        {t.status === 'done' ? `termín ${fmt(t.deadline, 'd. M.')}` : relativeDeadline(t.deadline)}
                      </span>
                    )}
                    {t.status === 'done' && t.completed_at && <span>hotové {fmt(t.completed_at, 'd. M.')}</span>}
                  </span>
                </button>
                <div className="task-progress" title={`Odpracované ${fmtDuration(done)}, naplánované ${fmtDuration(covered)}`}>
                  <span className="meter double">
                    <span className="planned" style={{ width: `${Math.min(100, (covered / t.estimated_minutes) * 100)}%` }} />
                    <span className="done" style={{ width: `${Math.min(100, (done / t.estimated_minutes) * 100)}%` }} />
                  </span>
                  <span className="small muted">
                    {fmtDuration(done)} / {fmtDuration(t.estimated_minutes)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function cmpDeadline(a: Task, b: Task) {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return 0;
}
