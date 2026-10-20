import { useState, type CSSProperties } from 'react';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { PRIORITY_LABELS, priorityColor } from '../lib/meta';
import { coveredMinutes, doneMinutes } from '../lib/planner';
import { fmt, fmtDuration, relativeDeadline } from '../lib/time';
import type { Task } from '../lib/types';
import { useToast } from '../components/Toast';
import { t } from '../lib/i18n';

type Filter = 'todo' | 'done';
type Sort = 'deadline' | 'priority';

export function TasksPage() {
  const { tasks, sessions, profile, categoryById, update, settleFinishedTask } = useData();
  const editor = useEditor();
  const notify = useToast();
  const [filter, setFilter] = useState<Filter>('todo');
  const [sort, setSort] = useState<Sort>('deadline');

  const list = tasks
    .filter((task) => task.status === filter)
    .sort((a, b) => {
      if (filter === 'done') return (b.completed_at ?? '').localeCompare(a.completed_at ?? '');
      if (sort === 'priority') return b.priority - a.priority || cmpDeadline(a, b);
      return cmpDeadline(a, b) || b.priority - a.priority;
    });

  const toggle = async (task: Task) => {
    const done = task.status !== 'done';
    await update('tasks', task.id, {
      status: done ? 'done' : 'todo',
      completed_at: done ? new Date().toISOString() : null,
    });
    if (done) {
      await settleFinishedTask(task.id);
      notify(t('Hotovo: {title}', { title: task.title }), 'success');
    }
  };

  const openCount = tasks.filter((task) => task.status === 'todo').length;

  return (
    <div className="page page-tasks">
      <header className="toolbar">
        <div className="toolbar-nav">
          <h1 className="toolbar-title">{t('Úlohy')}</h1>
          <div className="segmented small" role="radiogroup" aria-label={t('Filter')}>
            <button role="radio" aria-checked={filter === 'todo'} onClick={() => setFilter('todo')}>
              {t('Otvorené ({n})', { n: openCount })}
            </button>
            <button role="radio" aria-checked={filter === 'done'} onClick={() => setFilter('done')}>
              {t('Hotové')}
            </button>
          </div>
        </div>
        <div className="toolbar-actions">
          {filter === 'todo' && (
            <label className="inline-select">
              {t('Zoradiť podľa')}
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="deadline">{t('termínu')}</option>
                <option value="priority">{t('dôležitosti')}</option>
              </select>
            </label>
          )}
          <button className="btn btn-primary" onClick={() => editor.editTask({})}>
            {t('Nová úloha')}
          </button>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="empty-state">
          {filter === 'todo' ? (
            <>
              <h2>{t('Nič otvorené')}</h2>
              <p>{t('Zapíš si, čo potrebuješ stihnúť, odhadni čas a daj termín. Plánovač ti to rozloží do voľných chvíľ.')}</p>
              <button className="btn btn-primary" onClick={() => editor.editTask({})}>
                {t('Pridať prvú úlohu')}
              </button>
            </>
          ) : (
            <p>{t('Zatiaľ nič hotové.')}</p>
          )}
        </div>
      ) : (
        <ul className="task-list">
          {list.map((task) => {
            const color = priorityColor(profile?.priority_colors, task.priority);
            const done = doneMinutes(task.id, sessions);
            const covered = coveredMinutes(task.id, sessions);
            const cat = categoryById(task.category_id);
            const overdue = task.status === 'todo' && task.deadline && new Date(task.deadline) < new Date();
            return (
              <li key={task.id} className="task-row" style={{ '--c': color } as CSSProperties}>
                <input
                  type="checkbox"
                  className="task-check"
                  checked={task.status === 'done'}
                  onChange={() => toggle(task)}
                  aria-label={task.status === 'done' ? t('Vrátiť {title}', { title: task.title }) : t('Hotovo: {title}', { title: task.title })}
                />
                <button className="task-main" onClick={() => editor.editTask(task)}>
                  <span className="task-title">{task.title}</span>
                  <span className="task-meta">
                    <span className="prio">{PRIORITY_LABELS[task.priority]}</span>
                    {cat && (
                      <span className="cat" style={{ '--cat': cat.color } as CSSProperties}>
                        {cat.name}
                      </span>
                    )}
                    {task.deadline && (
                      <span className={overdue ? 'deadline is-overdue' : 'deadline'}>
                        {task.status === 'done' ? t('termín {date}', { date: fmt(task.deadline, 'd. M.') }) : relativeDeadline(task.deadline)}
                      </span>
                    )}
                    {task.status === 'done' && task.completed_at && <span>{t('hotové {date}', { date: fmt(task.completed_at, 'd. M.') })}</span>}
                  </span>
                </button>
                <div
                  className="task-progress"
                  title={t('Odpracované {done}, naplánované {covered}', { done: fmtDuration(done), covered: fmtDuration(covered) })}
                >
                  <span className="meter double">
                    <span className="planned" style={{ width: `${Math.min(100, (covered / task.estimated_minutes) * 100)}%` }} />
                    <span className="done" style={{ width: `${Math.min(100, (done / task.estimated_minutes) * 100)}%` }} />
                  </span>
                  <span className="small muted">
                    {fmtDuration(done)} / {fmtDuration(task.estimated_minutes)}
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
