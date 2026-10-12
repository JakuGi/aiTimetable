import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, isSameWeek, isToday, startOfDay } from 'date-fns';
import { TimeGrid } from '../components/TimeGrid';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useCalendarItems } from '../lib/useCalendarItems';
import { coveredMinutes, plan, type PlannerWarning } from '../lib/planner';
import { PRIORITY_LABELS, priorityColor } from '../lib/meta';
import { fmt, fmtDuration, relativeDeadline, timeToMinutes, toDateInput, weekDays, weekStart } from '../lib/time';
import { useToast } from '../components/Toast';
import { useMediaQuery } from '../lib/useMediaQuery';

type View = 'week' | 'day';

export function WeekPage() {
  const data = useData();
  const editor = useEditor();
  const notify = useToast();
  const narrow = useMediaQuery('(max-width: 760px)');
  const [params, setParams] = useSearchParams();
  const anchor = params.get('d') ? new Date(`${params.get('d')}T00:00`) : startOfDay(new Date());
  const view: View = (params.get('view') as View) ?? (narrow ? 'day' : 'week');
  const [planning, setPlanning] = useState(false);
  const [warnings, setWarnings] = useState<PlannerWarning[]>([]);

  const days = useMemo(
    () => (view === 'day' ? [anchor] : weekDays(weekStart(anchor))),
    [view, anchor.getTime()],
  );
  const { items, strip } = useCalendarItems(days);

  const go = (date: Date, v: View = view) => {
    const next = new URLSearchParams(params);
    next.set('d', toDateInput(date));
    next.set('view', v);
    setParams(next, { replace: true });
  };
  const step = view === 'day' ? 1 : 7;

  const suggested = data.sessions.filter((s) => s.status === 'suggested');
  const openTasks = data.tasks.filter((t) => t.status === 'todo');

  // keep warnings honest when tasks change elsewhere
  useEffect(() => {
    setWarnings((w) => w.filter((x) => openTasks.some((t) => t.id === x.taskId)));
  }, [data.tasks]);

  const runPlanner = async () => {
    if (!data.profile) return;
    setPlanning(true);
    const result = plan({
      now: new Date(),
      profile: data.profile,
      routine: data.routine_blocks,
      events: data.events,
      sessions: data.sessions,
      tasks: data.tasks,
    });
    const ok = await data.saveSuggestions(result.suggestions);
    setPlanning(false);
    if (!ok) return;
    setWarnings(result.warnings);
    const work = result.suggestions.filter((s) => s.kind === 'task').length;
    const fun = result.suggestions.length - work;
    if (!result.suggestions.length) {
      notify(openTasks.length ? 'Nenašiel som voľný čas na nové bloky.' : 'Nemáš otvorené úlohy, máš voľno.', 'info');
    } else {
      notify(`Návrh: ${work} ${work === 1 ? 'blok' : work < 5 ? 'bloky' : 'blokov'} práce a ${fun}× voľný čas. Prijmi ich alebo uprav.`, 'success');
    }
  };

  const acceptAll = () => data.setSessionStatus(suggested.map((s) => s.id), 'planned');
  const discardAll = () => data.saveSuggestions([]);

  const dayStartHour = data.profile ? Math.floor(timeToMinutes(data.profile.day_start) / 60) : 7;
  const isCurrent = view === 'day' ? isToday(anchor) : isSameWeek(anchor, new Date(), { weekStartsOn: 1 });
  const nowHour = new Date().getHours();

  const upcoming = openTasks
    .filter((t) => t.deadline)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .slice(0, 8);
  const noDeadline = openTasks.filter((t) => !t.deadline);

  return (
    <div className="page page-week">
      <header className="toolbar">
        <div className="toolbar-nav">
          <button className="icon-btn" onClick={() => go(addDays(anchor, -step))} aria-label="Predchádzajúce">
            <Chevron dir="left" />
          </button>
          <button className="btn btn-ghost" onClick={() => go(startOfDay(new Date()))} disabled={isCurrent}>
            Dnes
          </button>
          <button className="icon-btn" onClick={() => go(addDays(anchor, step))} aria-label="Ďalšie">
            <Chevron dir="right" />
          </button>
          <h1 className="toolbar-title">
            {view === 'day'
              ? fmt(anchor, 'EEEE d. MMMM')
              : `${fmt(days[0], 'd. M.')} – ${fmt(days[6], 'd. M. yyyy')}`}
          </h1>
        </div>
        <div className="toolbar-actions">
          <div className="segmented small" role="radiogroup" aria-label="Zobrazenie">
            <button role="radio" aria-checked={view === 'day'} onClick={() => go(anchor, 'day')}>
              Deň
            </button>
            <button role="radio" aria-checked={view === 'week'} onClick={() => go(anchor, 'week')}>
              Týždeň
            </button>
          </div>
          <button className="btn btn-ghost" onClick={() => editor.editTask({})}>
            Nová úloha
          </button>
          <button className="btn btn-primary" onClick={runPlanner} disabled={planning || !data.profile}>
            {planning ? 'Plánujem…' : 'Navrhnúť plán'}
          </button>
        </div>
      </header>

      {suggested.length > 0 && (
        <div className="suggest-bar" role="region" aria-label="Návrh plánu">
          <span className="pencil-swatch" aria-hidden="true" />
          <p>
            Ceruzkou je zakreslený návrh: {suggested.length}{' '}
            {suggested.length === 1 ? 'blok' : suggested.length < 5 ? 'bloky' : 'blokov'}. Klikni na blok a uprav ho,
            alebo prijmi všetko naraz.
          </p>
          <button className="btn btn-ghost" onClick={discardAll}>
            Zahodiť návrh
          </button>
          <button className="btn btn-primary" onClick={acceptAll}>
            Prijať všetko
          </button>
        </div>
      )}

      <div className="week-layout">
        <section className="week-grid" aria-label="Rozvrh">
          <TimeGrid
            days={days}
            items={items}
            strip={strip}
            scrollToHour={isCurrent ? Math.max(dayStartHour, nowHour - 1) : dayStartHour}
            onSlotClick={(start) => editor.editEvent({ starts_at: start.toISOString() })}
          />
        </section>

        <aside className="side-panel" aria-label="Termíny a úlohy">
          {warnings.length > 0 && (
            <section className="warn-box">
              <h2>Toto sa nezmestí</h2>
              <ul>
                {warnings.map((w) => {
                  const t = data.taskById(w.taskId);
                  if (!t) return null;
                  return (
                    <li key={w.taskId}>
                      <button className="link-btn" onClick={() => editor.editTask(t)}>
                        {t.title}
                      </button>
                      <span>
                        {w.reason === 'overdue'
                          ? `Termín už uplynul, ostáva ${fmtDuration(w.missingMinutes)}.`
                          : w.reason === 'deadline'
                            ? `Do termínu chýba ${fmtDuration(w.missingMinutes)} voľného času.`
                            : `V najbližších ${data.profile?.planning_horizon_days} dňoch chýba ${fmtDuration(w.missingMinutes)}.`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="small muted">Skús posunúť termín, znížiť odhad alebo uvoľniť čas v rozvrhu.</p>
            </section>
          )}

          <section>
            <h2>Najbližšie termíny</h2>
            {upcoming.length === 0 && (
              <p className="empty">
                Žiadne termíny.{' '}
                <button className="link-btn" onClick={() => editor.editTask({})}>
                  Pridaj úlohu
                </button>{' '}
                a plánovač jej nájde čas.
              </p>
            )}
            <ul className="task-mini">
              {upcoming.map((t) => (
                <TaskMini key={t.id} taskId={t.id} />
              ))}
            </ul>
          </section>

          {noDeadline.length > 0 && (
            <section>
              <h2>Bez termínu</h2>
              <ul className="task-mini">
                {noDeadline.slice(0, 6).map((t) => (
                  <TaskMini key={t.id} taskId={t.id} />
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function TaskMini({ taskId }: { taskId: string }) {
  const { taskById, sessions, profile, categoryById } = useData();
  const editor = useEditor();
  const t = taskById(taskId);
  if (!t) return null;
  const covered = coveredMinutes(t.id, sessions);
  const pct = Math.min(100, Math.round((covered / t.estimated_minutes) * 100));
  const color = priorityColor(profile?.priority_colors, t.priority);
  return (
    <li>
      <button className="task-mini-btn" onClick={() => editor.editTask(t)} style={{ '--c': color } as CSSProperties}>
        <span className="task-mini-title">{t.title}</span>
        <span className="task-mini-meta">
          {t.deadline ? relativeDeadline(t.deadline) : PRIORITY_LABELS[t.priority]}
          {categoryById(t.category_id) ? `, ${categoryById(t.category_id)!.name}` : ''}
        </span>
        <span className="meter" aria-label={`Naplánované ${pct} %`}>
          <span style={{ width: `${pct}%` }} />
        </span>
      </button>
    </li>
  );
}

export function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M12.5 4.5L7 10l5.5 5.5' : 'M7.5 4.5L13 10l-5.5 5.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
