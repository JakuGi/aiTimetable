import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, isSameDay, isSameWeek, isToday, startOfDay } from 'date-fns';
import { TimeGrid } from '../components/TimeGrid';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useCalendarItems } from '../lib/useCalendarItems';
import { coveredMinutes, plan, type PlannerWarning, type Suggestion } from '../lib/planner';
import { NowCard } from '../components/NowCard';
import { fmtTime } from '../lib/time';
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
import { plural, t } from '../lib/i18n';
import { useGender } from '../lib/gender';

type View = 'day' | '3day' | 'week';
const VIEWS: { value: View; label: string }[] = [
  { value: 'day', get label() { return t('Deň'); } },
  { value: '3day', get label() { return t('3 dni'); } },
  { value: 'week', get label() { return t('Týždeň'); } },
];

export function WeekPage() {
  const data = useData();
  const editor = useEditor();
  const notify = useToast();
  const g = useGender();
  const narrow = useMediaQuery('(max-width: 760px)');
  const [params, setParams] = useSearchParams();
  const anchor = params.get('d') ? new Date(`${params.get('d')}T00:00`) : startOfDay(new Date());
  const view: View = (params.get('view') as View) ?? (narrow ? 'day' : 'week');
  const [planning, setPlanning] = useState(false);
  const [warnings, setWarnings] = useState<PlannerWarning[]>([]);
  const [sheet, setSheet] = useState(false);
  const [drawFree, setDrawFree] = useState(false);
  const [intrusions, setIntrusions] = useState<Suggestion[]>([]);

  const days = useMemo(
    () =>
      view === 'day' ? [anchor] : view === '3day' ? [0, 1, 2].map((i) => addDays(anchor, i)) : weekDays(weekStart(anchor)),
    [view, anchor.getTime()],
  );
  const { items, strip, bands } = useCalendarItems(days);

  const go = (date: Date, v: View = view) => {
    const next = new URLSearchParams(params);
    next.set('d', toDateInput(date));
    next.set('view', v);
    setParams(next, { replace: true });
  };
  const step = view === 'day' ? 1 : view === '3day' ? 3 : 7;

  const suggested = data.sessions.filter((s) => s.status === 'suggested');
  const openTasks = data.tasks.filter((task) => task.status === 'todo');

  // keep warnings honest when tasks change elsewhere
  useEffect(() => {
    setWarnings((w) => w.filter((x) => openTasks.some((task) => task.id === x.taskId)));
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
      gigs: data.profile.freelance_enabled ? data.gigs : [],
      freeBlocks: data.free_blocks,
    });
    const ok = await data.saveSuggestions(result.suggestions);
    setPlanning(false);
    if (!ok) return;
    setWarnings(result.warnings);
    setIntrusions(result.intrusions);
    if (result.intrusions.length) {
      const taken = result.intrusions.reduce((m, s) => m + (s.end.getTime() - s.start.getTime()) / 60_000, 0);
      notify(
        g(
          'Pozor: kvôli termínu som musel zobrať {time} z tvojho vyhradeného voľna.',
          'Pozor: kvôli termínu som musela zobrať {time} z tvojho vyhradeného voľna.',
          { time: fmtDuration(taken) },
        ),
        'error',
      );
    }
    const work = result.suggestions.length;
    if (!result.suggestions.length) {
      notify(
        openTasks.length
          ? g('Nenašiel som voľný čas na nové bloky.', 'Nenašla som voľný čas na nové bloky.')
          : t('Nemáš otvorené úlohy, máš voľno.'),
        'info',
      );
    } else {
      notify(
        t(result.intrusions.length ? 'Návrh: {n} {blocks} práce.' : 'Návrh: {n} {blocks} práce, vyhradené voľno ostalo voľné.', {
          n: work,
          blocks: plural(work, 'blok', 'bloky', 'blokov'),
        }),
        'success',
      );
    }
    if (result.warnings.length && narrow) setSheet(true);
  };

  const acceptAll = () => data.setSessionStatus(suggested.map((s) => s.id), 'planned');
  const discardAll = () => data.saveSuggestions([]);

  const shownWeek = weekStart(anchor);
  const parity = data.profile ? weekParity(anchor, data.profile.odd_week_anchor) : null;

  /** Buses differ week to week: reuse last week's trips in one click, then adjust. */
  const copyTrips = async () => {
    const prevStart = addDays(shownWeek, -7).getTime();
    const thisStart = shownWeek.getTime();
    const taken = new Set(data.events.map((e) => `${e.title}|${new Date(e.starts_at).getTime()}`));
    const rows = data.events
      .filter((e) => {
        const at = new Date(e.starts_at).getTime();
        return e.kind === 'commute' && !e.all_day && at >= prevStart && at < thisStart;
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
    if (!rows.length) return notify(t('Minulý týždeň nemá cesty, ktoré by tu ešte chýbali.'), 'info');
    if (await data.insertMany('events', rows)) notify(t('Skopírované cesty: {n}.', { n: rows.length }), 'success');
  };

  const dayStartHour = data.profile ? Math.floor(timeToMinutes(data.profile.day_start) / 60) : 7;
  const isCurrent =
    view === 'week' ? isSameWeek(anchor, new Date(), { weekStartsOn: 1 }) : days.some((d) => isToday(d));
  const nowHour = new Date().getHours();

  const title =
    view === 'day'
      ? fmt(anchor, narrow ? 'EEEE d. M.' : 'EEEE d. MMMM')
      : `${fmt(days[0], 'd. M.')} – ${fmt(days[days.length - 1], narrow ? 'd. M.' : 'd. M. yyyy')}`;

  const deadlines = openTasks.filter((task) => task.deadline).length;
  const sideProps = { shownWeek, warnings, intrusions, copyTrips };

  /** Free time drawn into the timetable; pencil work already there is noted. */
  const drawFreeBlock = async (start: Date, end: Date) => {
    const created = await data.insert('free_blocks', { starts_at: start.toISOString(), ends_at: end.toISOString() });
    if (!created) return;
    const clash = suggested.filter(
      (s) => new Date(s.starts_at).getTime() < end.getTime() && new Date(s.ends_at).getTime() > start.getTime(),
    ).length;
    const range = `${fmtTime(start)}–${fmtTime(end)}`;
    notify(
      clash
        ? t('Vyhradené voľno {range}. Prekrýva návrh ceruzkou, daj Navrhnúť plán znova.', { range })
        : t('Vyhradené voľno {range}.', { range }),
      'success',
    );
  };

  return (
    <div className="page page-week">
      <header className="wk-head">
        <div className="wk-row">
          {!narrow && (
            <div className="wk-nav">
              <button className="icon-btn" onClick={() => go(addDays(anchor, -step))} aria-label={t('Predchádzajúce')}>
                <Chevron dir="left" />
              </button>
              <button className="btn btn-ghost" onClick={() => go(startOfDay(new Date()))} disabled={isCurrent}>
                {t('Dnes')}
              </button>
              <button className="icon-btn" onClick={() => go(addDays(anchor, step))} aria-label={t('Ďalšie')}>
                <Chevron dir="right" />
              </button>
            </div>
          )}
          <h1 className="wk-title">{title}</h1>
          {parity && <span className={`parity-tag parity-${parity}`}>{parity === 'odd' ? t('nepárny') : t('párny')}</span>}
          <div className="wk-actions">
            {!narrow && (
              <div className="segmented small" role="radiogroup" aria-label={t('Zobrazenie')}>
                {VIEWS.map((v) => (
                  <button key={v.value} role="radio" aria-checked={view === v.value} onClick={() => go(anchor, v.value)}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            <button
              className={`btn btn-ghost btn-icon-label draw-toggle${drawFree ? ' is-on' : ''}`}
              data-tour="free"
              onClick={() => setDrawFree((d) => !d)}
              aria-pressed={drawFree}
              aria-label={t('Vyhradiť voľno')}
            >
              <FreeIcon />
              <span>{drawFree ? t('Hotovo') : t('Vyhradiť voľno')}</span>
            </button>
            <button
              className="btn btn-ghost btn-icon-label"
              data-tour="add"
              onClick={() => editor.editTask({})}
              aria-label={t('Pridať úlohu, udalosť alebo pripomienku')}
              title={t('Pridať úlohu, udalosť alebo pripomienku')}
            >
              <PlusIcon />
              <span>{t('Pridať')}</span>
            </button>
            <button
              className="btn btn-primary btn-icon-label"
              data-tour="plan"
              onClick={runPlanner}
              disabled={planning || !data.profile}
            >
              <PencilIcon />
              <span>{planning ? t('Plánujem…') : narrow ? t('Návrh') : t('Navrhnúť plán')}</span>
            </button>
          </div>
        </div>

        {narrow && (
          <>
            <DayStrip
              anchor={anchor}
              onPick={(d) => go(d, view === 'week' ? 'day' : view)}
              onWeek={(dir) => go(addDays(anchor, dir * 7))}
            />
            <div className="wk-row wk-row-sub">
              <div className="segmented small" role="radiogroup" aria-label={t('Zobrazenie')}>
                {VIEWS.map((v) => (
                  <button key={v.value} role="radio" aria-checked={view === v.value} onClick={() => go(anchor, v.value)}>
                    {v.label}
                  </button>
                ))}
              </div>
              <button className="btn btn-ghost btn-small sheet-btn" onClick={() => setSheet(true)}>
                <span className="label-long">{t('Spoje a termíny')}</span>
                <span className="label-short">{t('Spoje')}</span>
                {warnings.length > 0 ? <span className="badge badge-warn">{warnings.length}</span> : deadlines > 0 ? <span className="badge">{deadlines}</span> : null}
              </button>
            </div>
          </>
        )}
      </header>

      <NowCard />

      {drawFree && (
        <div className="draw-bar" role="status">
          <span className="free-swatch" aria-hidden="true" />
          <p>
            <b>{t('Kreslíš vyhradené voľno.')}</b>{' '}
            {narrow
              ? t('Ťukni na čas, kde ho chceš (1 h), potom ho potiahni alebo mu zmeň dĺžku spodným okrajom.')
              : t('Ťahaj myšou v dni od začiatku po koniec voľna. Klik pridá 1 h.')}{' '}
            {t('Plánovač sem prácu nedá.')}
          </p>
          <button className="btn btn-primary btn-small" onClick={() => setDrawFree(false)}>
            {t('Hotovo')}
          </button>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="suggest-bar" role="region" aria-label={t('Návrh plánu')}>
          <span className="pencil-swatch" aria-hidden="true" />
          <p>
            <b>
              {t('{n} {blocks} ceruzkou.', { n: suggested.length, blocks: plural(suggested.length, 'blok', 'bloky', 'blokov') })}
            </b>{' '}
            {narrow
              ? t('Podrž blok a potiahni ho inam.')
              : t('Ťahaj ich myšou na iný čas alebo deň, spodný okraj mení dĺžku. Klik otvorí detail.')}
          </p>
          <div className="suggest-actions">
            <button className="btn btn-ghost btn-small" onClick={discardAll}>
              {t('Zahodiť')}
            </button>
            <button className="btn btn-primary btn-small" onClick={acceptAll}>
              {t('Prijať všetko')}
            </button>
          </div>
        </div>
      )}

      <div className="week-layout">
        <section className="week-grid" aria-label={t('Môj týždeň')}>
          <TimeGrid
            days={days}
            items={items}
            strip={strip}
            bands={bands}
            scrollToHour={isCurrent ? Math.max(dayStartHour, nowHour - 1) : dayStartHour}
            onSlotClick={(start) => editor.editEvent({ starts_at: start.toISOString() })}
            onDraw={drawFree ? drawFreeBlock : undefined}
            onSwipe={narrow ? (dir) => go(addDays(anchor, dir * step)) : undefined}
          />
        </section>

        {!narrow && (
          <aside className="side-panel" aria-label={t('Spoje, termíny a úlohy')}>
            <WeekSide {...sideProps} />
          </aside>
        )}
      </div>

      {narrow && sheet && (
        <Modal title={t('Spoje a termíny')} onClose={() => setSheet(false)}>
          <div className="side-panel in-sheet">
            <WeekSide {...sideProps} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Seven days of the anchor's week as big tap targets (mobile). */
function DayStrip({ anchor, onPick, onWeek }: { anchor: Date; onPick: (d: Date) => void; onWeek: (dir: 1 | -1) => void }) {
  const days = weekDays(weekStart(anchor));
  return (
    <div className="day-strip" role="group" aria-label={t('Dni týždňa')}>
      <button className="strip-arrow" onClick={() => onWeek(-1)} aria-label={t('Predchádzajúci týždeň')}>
        <Chevron dir="left" />
      </button>
      {days.map((d) => (
        <button
          key={d.toISOString()}
          className={`strip-day${isToday(d) ? ' is-today' : ''}`}
          aria-pressed={isSameDay(d, anchor)}
          onClick={() => onPick(d)}
        >
          <span>{fmt(d, 'EEEEEE')}</span>
          <b>{fmt(d, 'd')}</b>
        </button>
      ))}
      <button className="strip-arrow" onClick={() => onWeek(1)} aria-label={t('Ďalší týždeň')}>
        <Chevron dir="right" />
      </button>
    </div>
  );
}

function WeekSide({
  shownWeek,
  warnings,
  intrusions,
  copyTrips,
}: {
  shownWeek: Date;
  warnings: PlannerWarning[];
  intrusions: Suggestion[];
  copyTrips: () => void;
}) {
  const data = useData();
  const editor = useEditor();
  const g = useGender();
  const openTasks = data.tasks.filter((task) => task.status === 'todo');
  const upcoming = openTasks
    .filter((task) => task.deadline)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .slice(0, 8);
  const noDeadline = openTasks.filter((task) => !task.deadline);

  return (
    <>
      {intrusions.length > 0 && (
        <section className="warn-box">
          <h2>{g('Siahol som do vyhradeného voľna', 'Siahla som do vyhradeného voľna')}</h2>
          <ul>
            {intrusions.map((s) => (
              <li key={s.start.toISOString()}>
                <b>{data.taskById(s.taskId)?.title ?? t('Úloha')}</b>
                <span>
                  {fmt(s.start, 'EEEE d. M.')}, {fmtTime(s.start)}–{fmtTime(s.end)}
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted">{t('Bez toho by sa termín nestihol. Ak to nechceš, posuň termín alebo uvoľni iný čas.')}</p>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="warn-box">
          <h2>{t('Toto sa nezmestí')}</h2>
          <ul>
            {warnings.map((w) => {
              const task = data.taskById(w.taskId);
              if (!task) return null;
              const time = fmtDuration(w.missingMinutes);
              return (
                <li key={w.taskId}>
                  <button className="link-btn" onClick={() => editor.editTask(task)}>
                    {task.title}
                  </button>
                  <span>
                    {w.reason === 'overdue'
                      ? t('Termín už uplynul, ostáva {time}.', { time })
                      : w.reason === 'deadline'
                        ? t('Do termínu chýba {time} voľného času.', { time })
                        : t('V najbližších {n} dňoch chýba {time}.', { n: data.profile?.planning_horizon_days ?? 0, time })}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="small muted">{t('Skús posunúť termín, znížiť odhad alebo uvoľniť čas v rozvrhu.')}</p>
        </section>
      )}

      <section>
        <h2>{t('Spoje v tomto týždni')}</h2>
        {data.event_templates.length === 0 ? (
          <p className="empty">
            {t('Ulož si autobusy a vlaky, ktorými chodíš, a vkladaj ich len do dní, keď nimi naozaj ideš.')}{' '}
            <button className="link-btn" onClick={() => editor.editTemplate({})}>
              {t('Pridať prvý spoj')}
            </button>
          </p>
        ) : (
          <ul className="templates">
            {data.event_templates.map((tpl) => {
              const count = weekDays(shownWeek).filter((d) => placedOn(tpl, d, data.events)).length;
              return (
                <li key={tpl.id}>
                  <button
                    className="template-btn"
                    style={{ '--c': tpl.color ?? data.categoryById(tpl.category_id)?.color ?? '#7C879C' } as CSSProperties}
                    onClick={() => editor.placeTemplate(tpl, shownWeek)}
                  >
                    <span className="template-time">{tpl.start_time.slice(0, 5)}</span>
                    <span className="template-title">{tpl.title}</span>
                    <span className="template-count">{count ? t('{n}× tento týždeň', { n: count }) : t('pridať do dní')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="quick-row">
          {data.event_templates.length > 0 && (
            <button className="link-btn" onClick={() => editor.editTemplate({})}>
              {t('Nový spoj')}
            </button>
          )}
          <button className="link-btn" onClick={copyTrips}>
            {t('Skopírovať cesty z minulého týždňa')}
          </button>
        </div>
      </section>

      <section>
        <h2>{t('Najbližšie termíny')}</h2>
        {upcoming.length === 0 && (
          <p className="empty">
            {t('Žiadne termíny.')}{' '}
            <button className="link-btn" onClick={() => editor.editTask({})}>
              {t('Pridaj úlohu')}
            </button>{' '}
            {t('a plánovač jej nájde čas.')}
          </p>
        )}
        <ul className="task-mini">
          {upcoming.map((task) => (
            <TaskMini key={task.id} taskId={task.id} />
          ))}
        </ul>
      </section>

      {noDeadline.length > 0 && (
        <section>
          <h2>{t('Bez termínu')}</h2>
          <ul className="task-mini">
            {noDeadline.slice(0, 6).map((task) => (
              <TaskMini key={task.id} taskId={task.id} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function TaskMini({ taskId }: { taskId: string }) {
  const { taskById, sessions, profile, categoryById } = useData();
  const editor = useEditor();
  const task = taskById(taskId);
  if (!task) return null;
  const covered = coveredMinutes(task.id, sessions);
  const pct = Math.min(100, Math.round((covered / task.estimated_minutes) * 100));
  const color = priorityColor(profile?.priority_colors, task.priority);
  return (
    <li>
      <button className="task-mini-btn" onClick={() => editor.editTask(task)} style={{ '--c': color } as CSSProperties}>
        <span className="task-mini-title">{task.title}</span>
        <span className="task-mini-meta">
          {task.deadline ? relativeDeadline(task.deadline) : PRIORITY_LABELS[task.priority]}
          {categoryById(task.category_id) ? `, ${categoryById(task.category_id)!.name}` : ''}
        </span>
        <span className="meter" aria-label={t('Naplánované {pct} %', { pct })}>
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

function FreeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="4" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeDasharray="3 2" />
      <path d="M7 10.5l2 2 4-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M4 16l1-4 8.5-8.5a1.4 1.4 0 012 0l1 1a1.4 1.4 0 010 2L8 15l-4 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
