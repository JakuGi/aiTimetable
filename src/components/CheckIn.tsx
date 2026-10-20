import { useEffect, useState, type CSSProperties } from 'react';
import { isToday, isTomorrow, isYesterday } from 'date-fns';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useToast } from './Toast';
import { pendingCheckIns } from '../lib/checkin';
import { planFollowUp, sessionMinutes } from '../lib/planner';
import { priorityColor } from '../lib/meta';
import { fmt, fmtDuration, fmtTime } from '../lib/time';
import { useGender } from '../lib/gender';
import { t } from '../lib/i18n';
import type { Session } from '../lib/types';

const EXTRA = [15, 30, 45, 60, 90, 120];

const day = (d: string) => {
  const date = new Date(d);
  if (isToday(date)) return t('dnes');
  if (isYesterday(date)) return t('včera');
  if (isTomorrow(date)) return t('zajtra');
  return fmt(date, 'EEEE d. M.');
};

function useNow(every: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), every);
    const wake = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [every]);
  return now;
}

/**
 * When an accepted work block is over, ask how it went: done, done but it needs more time
 * (adds the time to the task and pencils in a new block), or not done (pencils it in again).
 * Lives in the layout, so it shows up on any screen.
 */
export function CheckInPanel() {
  const data = useData();
  const now = useNow(30_000);
  const pending = pendingCheckIns(data.sessions, data.tasks, now);
  // "later" hides the blocks asked about so far; a newly finished one brings the panel back
  const [later, setLater] = useState<Set<string>>(new Set());
  const hidden = pending.length > 0 && pending.every((s) => later.has(s.id));

  if (!pending.length) return null;
  if (hidden) {
    return (
      <button className="checkin-pill" onClick={() => setLater(new Set())}>
        <span className="checkin-dot" aria-hidden="true" />
        {t('Ako išli bloky?')}
        <span className="badge">{pending.length}</span>
      </button>
    );
  }
  const current = pending.find((s) => !later.has(s.id)) ?? pending[0];
  return (
    <CheckInCard
      key={current.id}
      session={current}
      index={pending.indexOf(current) + 1}
      count={pending.length}
      onLater={() => setLater(new Set(pending.map((s) => s.id)))}
    />
  );
}

function CheckInCard({
  session,
  index,
  count,
  onLater,
}: {
  session: Session;
  index: number;
  count: number;
  onLater: () => void;
}) {
  const data = useData();
  const editor = useEditor();
  const notify = useToast();
  const g = useGender();
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState(30);
  const [busy, setBusy] = useState(false);
  const task = data.taskById(session.task_id);
  if (!task) return null;
  const length = sessionMinutes(session);
  const add = Math.min(600, Math.max(5, Math.round(extra / 5) * 5));
  const color = priorityColor(data.profile?.priority_colors, task.priority);

  /** Pencil in `minutes` more of this task, around everything else, and say where it went. */
  const pencilIn = async (minutes: number, status: Session['status']) => {
    if (!data.profile) return;
    const sessions = data.sessions.map((s) => (s.id === session.id ? { ...s, status } : s));
    const { suggestions, warnings, intrusions } = planFollowUp(
      {
        now: new Date(),
        profile: data.profile,
        routine: data.routine_blocks,
        events: data.events,
        sessions,
        tasks: data.tasks,
        gigs: data.profile.freelance_enabled ? data.gigs : [],
        freeBlocks: data.free_blocks,
      },
      task.id,
      minutes,
    );
    const missing = warnings[0]?.missingMinutes ?? 0;
    if (!suggestions.length) {
      const time = fmtDuration(minutes);
      notify(
        task.deadline
          ? g(
              'Na {time} som nenašiel voľný čas do termínu. Uvoľni čas v rozvrhu alebo posuň termín.',
              'Na {time} som nenašla voľný čas do termínu. Uvoľni čas v rozvrhu alebo posuň termín.',
              { time },
            )
          : g(
              'Na {time} som nenašiel voľný čas. Uvoľni čas v rozvrhu alebo posuň termín.',
              'Na {time} som nenašla voľný čas. Uvoľni čas v rozvrhu alebo posuň termín.',
              { time },
            ),
        'error',
      );
      return;
    }
    const ok = await data.insertMany(
      'sessions',
      suggestions.map((s) => ({
        kind: 'task' as const,
        task_id: task.id,
        starts_at: s.start.toISOString(),
        ends_at: s.end.toISOString(),
        status: 'suggested' as const,
      })),
    );
    if (!ok) return;
    const first = suggestions[0];
    const where = `${day(first.start.toISOString())} ${fmtTime(first.start)}–${fmtTime(first.end)}`;
    const parts = [
      suggestions.length > 1
        ? t('Ceruzkou: {title}, {where} a ešte {n}× ďalej.', { title: task.title, where, n: suggestions.length - 1 })
        : t('Ceruzkou: {title}, {where}.', { title: task.title, where }),
    ];
    if (missing) parts.push(t('Do termínu sa nezmestí {time}.', { time: fmtDuration(missing) }));
    if (intrusions.length) {
      parts.push(
        g('Kvôli termínu som musel siahnuť do tvojho vyhradeného voľna.', 'Kvôli termínu som musela siahnuť do tvojho vyhradeného voľna.'),
      );
    }
    parts.push(t('Prijmi ho v záložke Môj týždeň.'));
    notify(parts.join(' '), missing || intrusions.length ? 'info' : 'success');
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const done = () => run(() => data.setSessionStatus([session.id], 'done'));

  const notDone = () =>
    run(async () => {
      if (await data.setSessionStatus([session.id], 'skipped')) await pencilIn(length, 'skipped');
    });

  const needMore = () =>
    run(async () => {
      if (!(await data.setSessionStatus([session.id], 'done'))) return;
      if (!(await data.update('tasks', task.id, { estimated_minutes: Math.min(10000, task.estimated_minutes + add) }))) return;
      await pencilIn(add, 'done');
    });

  const taskDone = () =>
    run(async () => {
      if (!(await data.setSessionStatus([session.id], 'done'))) return;
      if (!(await data.update('tasks', task.id, { status: 'done', completed_at: new Date().toISOString() }))) return;
      await data.settleFinishedTask(task.id);
      notify(t('Hotovo: {title}', { title: task.title }), 'success');
    });

  return (
    <section className="checkin" role="region" aria-label={t('Ako išiel blok práce')} style={{ '--c': color } as CSSProperties}>
      <header className="checkin-head">
        <span className="checkin-dot" aria-hidden="true" />
        <span>
          {t('Blok skončil')}
          {count > 1 ? ` · ${t('{index} z {count}', { index, count })}` : ''}
        </span>
        <button className="checkin-later" onClick={onLater} disabled={busy}>
          {t('Neskôr')}
        </button>
      </header>
      <button className="checkin-title" onClick={() => editor.editTask(task)}>
        {task.title}
      </button>
      <p className="checkin-when">
        {day(session.starts_at)} {fmtTime(session.starts_at)}–{fmtTime(session.ends_at)} · {fmtDuration(length)}
      </p>

      {!more ? (
        <div className="checkin-actions">
          <button className="btn btn-primary" onClick={done} disabled={busy}>
            {g('Splnil som podľa plánu', 'Splnila som podľa plánu')}
          </button>
          <button className="btn btn-ghost" onClick={() => setMore(true)} disabled={busy}>
            {g('Splnil, ale treba viac času…', 'Splnila, ale treba viac času…')}
          </button>
          <button className="btn btn-ghost" onClick={notDone} disabled={busy}>
            {g('Nesplnil som', 'Nesplnila som')}
            <small>{t('naplánujem {time} znova ceruzkou', { time: fmtDuration(length) })}</small>
          </button>
          <button className="link-btn checkin-finish" onClick={taskDone} disabled={busy}>
            {t('Celá úloha je už hotová')}
          </button>
        </div>
      ) : (
        <div className="checkin-more">
          <p className="checkin-q">{t('Koľko času ešte treba?')}</p>
          <div className="chips" role="group" aria-label={t('Ďalší čas')}>
            {EXTRA.map((m) => (
              <button key={m} className="chip" aria-pressed={extra === m} onClick={() => setExtra(m)}>
                {fmtDuration(m)}
              </button>
            ))}
          </div>
          <label className="checkin-custom">
            {t('Iné:')}
            <input
              type="number"
              min={5}
              max={600}
              step={5}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value) || 0)}
            />
            min
          </label>
          <p className="small muted">
            {t('Pridám to k odhadu úlohy ({from} → {to}) a nájdem voľný čas ceruzkou.', {
              from: fmtDuration(task.estimated_minutes),
              to: fmtDuration(task.estimated_minutes + add),
            })}
          </p>
          <div className="checkin-row">
            <button className="btn btn-ghost" onClick={() => setMore(false)} disabled={busy}>
              {t('Späť')}
            </button>
            <button className="btn btn-primary" onClick={needMore} disabled={busy || extra < 5}>
              {busy ? t('Plánujem…') : t('Naplánovať {time}', { time: fmtDuration(add) })}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
