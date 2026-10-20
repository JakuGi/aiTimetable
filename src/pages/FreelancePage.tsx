import { useEffect, useState, type CSSProperties } from 'react';
import { addMonths, isSameDay, isSameMonth, startOfMonth } from 'date-fns';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { useToast } from '../components/Toast';
import {
  FREELANCE_CATEGORY,
  FREELANCE_COLOR,
  GIG_MODES,
  GIG_STATUS,
  fmtMoney,
  gigDate,
  gigEarnings,
  gigExpenses,
  gigNet,
} from '../lib/freelance';
import { fmt, fmtTime, relativeDeadline } from '../lib/time';
import type { Gig, GigMode } from '../lib/types';
import { Chevron } from './WeekPage';
import { t } from '../lib/i18n';

type Tab = 'month' | 'unpaid' | 'all';

export function FreelancePage() {
  const { gigs, sessions, profile, update, categories, insert } = useData();
  const editor = useEditor();
  const notify = useToast();
  const [tab, setTab] = useState<Tab>('month');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [modeFilter, setModeFilter] = useState<GigMode | 'all'>('all');

  if (!profile) return null;

  if (!profile.freelance_enabled) {
    const enable = async () => {
      if (!categories.some((c) => c.name === FREELANCE_CATEGORY)) {
        await insert('categories', { name: FREELANCE_CATEGORY, color: FREELANCE_COLOR, sort_order: categories.length });
      }
      if (await update('profiles', profile.id, { freelance_enabled: true })) notify(t('Freelance mód je zapnutý.'), 'success');
    };
    return (
      <div className="page">
        <div className="empty-state">
          <h2>{t('Freelance mód je vypnutý')}</h2>
          <p>
            {t('Zapni ho, ak si privyrábaš: akcie na mieste (nakladanie, sťahovanie, práca na podujatí) alebo projekty do termínu. Uvidíš zárobky, výdavky aj čas na prípravu a cestu priamo v rozvrhu.')}
          </p>
          <button className="btn btn-primary" onClick={enable}>
            {t('Zapnúť freelance mód')}
          </button>
        </div>
      </div>
    );
  }

  const byMode = gigs.filter((g) => modeFilter === 'all' || g.mode === modeFilter);
  const inMonth = byMode.filter((g) => isSameMonth(new Date(gigDate(g)), month));
  const unpaid = gigs.filter((g) => g.status === 'done');
  const list = (tab === 'month' ? inMonth : tab === 'unpaid' ? unpaid.filter((g) => byMode.includes(g)) : byMode)
    .slice()
    .sort((a, b) => gigDate(a).localeCompare(gigDate(b)));

  const counted = inMonth.filter((g) => g.status !== 'cancelled');
  const earned = counted.reduce((s, g) => s + gigEarnings(g, sessions), 0);
  const spent = counted.reduce((s, g) => s + gigExpenses(g), 0);
  const owed = unpaid.reduce((s, g) => s + gigEarnings(g, sessions), 0);

  const defaultMode = profile.freelance_default_mode;
  const other: GigMode = defaultMode === 'event' ? 'project' : 'event';

  // group rows under their day
  const groups: { day: Date; gigs: Gig[] }[] = [];
  for (const g of list) {
    const d = new Date(gigDate(g));
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.day, d)) last.gigs.push(g);
    else groups.push({ day: d, gigs: [g] });
  }

  return (
    <div className="page page-freelance">
      <header className="toolbar">
        <div className="toolbar-nav">
          <h1 className="toolbar-title">{t('Freelance')}</h1>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={() => editor.editGig({ mode: other })}>
            {other === 'event' ? t('Nová akcia') : t('Nový projekt')}
          </button>
          <button className="btn btn-primary" onClick={() => editor.editGig({ mode: defaultMode })}>
            {defaultMode === 'event' ? t('Nová akcia') : t('Nový projekt')}
          </button>
        </div>
      </header>

      <section className="ledger" aria-label={t('Prehľad za {month}', { month: fmt(month, 'LLLL yyyy') })}>
        <div className="ledger-month">
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('Predchádzajúci mesiac')}>
            <Chevron dir="left" />
          </button>
          <span>{fmt(month, 'LLLL yyyy')}</span>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('Ďalší mesiac')}>
            <Chevron dir="right" />
          </button>
        </div>
        <dl className="ledger-rows">
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
          <div className="is-owed">
            <dt>{t('Čaká na platbu')}</dt>
            <dd>
              {fmtMoney(owed)}
              {unpaid.length > 0 && <small> ({unpaid.length})</small>}
            </dd>
          </div>
        </dl>
      </section>

      <div className="freelance-filters">
        <div className="segmented small" role="radiogroup" aria-label={t('Zobraziť')}>
          {(
            [
              ['month', t('Tento mesiac')],
              ['unpaid', `${t('Na platbu')}${unpaid.length ? ` (${unpaid.length})` : ''}`],
              ['all', t('Celá história')],
            ] as [Tab, string][]
          ).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={tab === v} onClick={() => setTab(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="segmented small" role="radiogroup" aria-label={t('Druh')}>
          {(
            [
              ['all', t('Všetky druhy')],
              ['event', t('Akcie')],
              ['project', t('Projekty')],
            ] as [GigMode | 'all', string][]
          ).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={modeFilter === v} onClick={() => setModeFilter(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <p>
            {tab === 'unpaid'
              ? t('Nikto ti nič nedlží.')
              : tab === 'month'
                ? t('V mesiaci {month} zatiaľ nič.', { month: fmt(month, 'LLLL') })
                : t('Zatiaľ žiadna freelance práca.')}{' '}
            {t('Pridaj akciu s časom a miestom alebo projekt s termínom.')}
          </p>
        </div>
      ) : (
        <ol className="gig-days">
          {groups.map(({ day, gigs: dayGigs }) => (
            <li key={day.toISOString()} className="gig-day">
              <div className="gig-date" aria-hidden="true">
                <b>{fmt(day, 'd')}</b>
                <span>{fmt(day, 'EEEEEE')}</span>
              </div>
              <ul className="gig-list">
                {dayGigs.map((g) => (
                  <GigRow key={g.id} gig={g} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const STATUS_ORDER: Gig['status'][] = ['planned', 'confirmed', 'done', 'paid', 'cancelled'];
const STATUS_SHORT: Record<Gig['status'], string> = {
  get planned() { return t('Dohodnuté'); },
  get confirmed() { return t('Potvrdené'); },
  get done() { return t('Čaká na platbu'); },
  get paid() { return t('Zaplatené'); },
  get cancelled() { return t('Zrušené'); },
};
const STATUS_TOAST: Record<Gig['status'], string> = {
  get planned() { return t('Dohodnuté'); },
  get confirmed() { return t('Potvrdené'); },
  get done() { return t('Hotovo'); },
  get paid() { return t('Zaplatené'); },
  get cancelled() { return t('Zrušené'); },
};

function GigRow({ gig: g }: { gig: Gig }) {
  const { sessions, update, categories, settleFinishedTask } = useData();
  const editor = useEditor();
  const notify = useToast();
  // the pill switches at once; the saved row catches up (or rolls it back on error)
  const [status, setLocal] = useState(g.status);
  useEffect(() => setLocal(g.status), [g.status]);
  const net = gigNet({ ...g, status }, sessions);
  const spent = gigExpenses(g);
  const past = g.mode === 'event' ? new Date(g.ends_at!) < new Date() : false;
  const color = categories.find((c) => c.name === FREELANCE_CATEGORY)?.color ?? FREELANCE_COLOR;

  const setStatus = async (next: Gig['status']) => {
    if (next === status) return;
    const prev = status;
    setLocal(next);
    const ok = await update('gigs', g.id, {
      status: next,
      paid_at: next === 'paid' ? (g.paid_at ?? new Date().toISOString()) : null,
    });
    if (!ok) return setLocal(prev);
    // linked project work follows: finished or cancelled leaves the planner, reopened comes back
    if (g.task_id) {
      const closed = next === 'done' || next === 'paid' || next === 'cancelled';
      await update('tasks', g.task_id, {
        status: closed ? 'done' : 'todo',
        completed_at: closed ? new Date().toISOString() : null,
      });
      if (closed) await settleFinishedTask(g.task_id);
    }
    notify(`${STATUS_TOAST[next]}: ${g.title}`, next === 'cancelled' ? 'info' : 'success');
  };

  return (
    <li className={`gig-row status-${status}`} style={{ '--c': color } as CSSProperties}>
      <button className="gig-main" onClick={() => editor.editGig(g)}>
        <span className="gig-title">{g.title}</span>
        <span className="gig-meta">
          <span className={`gig-mode mode-${g.mode}`}>{GIG_MODES[g.mode].label}</span>
          {g.mode === 'event' && g.starts_at && g.ends_at && (
            <span>
              {fmtTime(g.starts_at)}–{fmtTime(g.ends_at)}
              {g.prep_minutes + g.travel_minutes > 0
                ? `, ${t('odchod {time}', { time: fmtTime(new Date(new Date(g.starts_at).getTime() - (g.prep_minutes + g.travel_minutes) * 60000)) })}`
                : ''}
            </span>
          )}
          {g.mode === 'project' && g.deadline && <span>{t('odovzdať {when}', { when: relativeDeadline(g.deadline) })}</span>}
          {g.location && <span>{g.location}</span>}
          {g.client && <span>{g.client}</span>}
        </span>
      </button>
      <div className="gig-money">
        <b className={net < 0 ? 'is-loss' : undefined}>{fmtMoney(net)}</b>
        {spent > 0 && <span>{t('výdavky {sum}', { sum: fmtMoney(spent) })}</span>}
        <div className="gig-actions">
          <select
            className="status-pill"
            data-status={status}
            value={status}
            onChange={(e) => setStatus(e.target.value as Gig['status'])}
            aria-label={t('Stav: {title}', { title: g.title })}
            title={GIG_STATUS[status]}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_SHORT[s]}
              </option>
            ))}
          </select>
          {(status === 'planned' || status === 'confirmed') && (past || g.mode === 'project') && (
            <button className="btn btn-ghost btn-small" onClick={() => setStatus('done')}>
              {t('Hotovo')}
            </button>
          )}
          {status === 'done' && (
            <button className="btn btn-primary btn-small" onClick={() => setStatus('paid')}>
              {t('Zaplatené')}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
