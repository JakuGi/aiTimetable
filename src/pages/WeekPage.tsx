import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, isSameWeek, isToday, startOfDay } from 'date-fns';
import { TimeGrid } from '../components/TimeGrid';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useCalendarItems } from '../lib/useCalendarItems';
import { coveredMinutes, plan, type PlannerWarning } from '../lib/planner';
import { PRIORITY_LABELS, priorityColor } from '../lib/meta';
import {
  fmt,
  fmtDuration,
  relativeDeadline,
  timeToMinutes,
  toDateInput,
  weekDays,
  weekParity,
  weekStart,
} from '../lib/time';
import { placedOn } from '../editor/TemplateDialogs';
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

  const shownWeek = weekStart(anchor);
  const parity = data.profile ? weekParity(anchor, data.profile.odd_week_anchor) : null;

  /** Buses differ week to week: reuse last week's trips in one click, then adjust. */
  const copyTrips = async () => {
    const prevStart = addDays(shownWeek, -7).getTime();
    const thisStart = shownWeek.getTime();
    const taken = new Set(data.events.map((e) => `${e.title}|${new Date(e.starts_at).getTime()}`));
    const rows = data.events
      .filter((e) => {
        const t = new Date(e.starts_at).getTime();
        return e.kind === 'commute' && !e.all_day && t >= prevStart && t < thisStart;
      })
      .map((e) => {
        const starts = addDays(new Date(e.starts_at), 7);
        const ends = e.ends_at ? addDays(new Date(e.ends_at), 7) : null;
        return {
          title: e.title,
          kind: e.kind,
          starts_at: starts.toISOString(),
          ends_at: ends?.toISOString() ?? null,
          all_day: false,
          location: e.location,
          notes: e.notes,
          category_id: e.category_id,
          color: e.color,
          remind_minutes_before: e.remind_minutes_before,
          blocks_planning: e.blocks_planning,
        };
      })
      .filter((r) => !taken.has(`${r.title}|${new Date(r.starts_at).getTime()}`));
    if (!rows.length) return notify('Minulý týždeň nemá cesty, ktoré by tu ešte chýbali.', 'info');
    if (await data.insertMany('events', rows)) notify(`Skopírované cesty: ${rows.length}.`, 'success');
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
          {parity && (
            <span className={`parity-tag parity-${parity}`}>{parity === 'odd' ? 'nepárny týždeň' : 'párny týždeň'}</span>
          )}
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

        <aside className="side-panel" aria-label="Spoje, termíny a úlohy">
          <section>
            <h2>Spoje v tomto týždni</h2>
            {data.event_templates.length === 0 ? (
              <p className="empty">
                Ulož si autobusy a vlaky, ktorými chodíš, a vkladaj ich len do dní, keď nimi naozaj ideš.{' '}
                <button className="link-btn" onClick={() => editor.editTemplate({})}>
                  Pridať prvý spoj
                </button>
              </p>
            ) : (
              <ul className="templates">
                {data.event_templates.map((t) => {
                  const count = weekDays(shownWeek).filter((d) => placedOn(t, d, data.events)).length;
                  return (
                    <li key={t.id}>
                      <button
                        className="template-btn"
                        style={{ '--c': t.color ?? data.categoryById(t.category_id)?.color ?? '#7C879C' } as CSSProperties}
                        onClick={() => editor.placeTemplate(t, shownWeek)}
                      >
                        <span className="template-time">{t.start_time.slice(0, 5)}</span>
                        <span className="template-title">{t.title}</span>
                        <span className="template-count">{count ? `${count}× tento týždeň` : 'pridať do dní'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="quick-row">
              {data.event_templates.length > 0 && (
                <button className="link-btn" onClick={() => editor.editTemplate({})}>
                  Nový spoj
                </button>
              )}
              <button className="link-btn" onClick={copyTrips}>
                Skopírovať cesty z minulého týždňa
              </button>
            </div>
          </section>

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
