import { useState, type CSSProperties } from 'react';
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
      if (await update('profiles', profile.id, { freelance_enabled: true })) notify('Freelance mód je zapnutý.', 'success');
    };
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Freelance mód je vypnutý</h2>
          <p>
            Zapni ho, ak si privyrábaš: akcie na mieste (nakladanie, sťahovanie, práca na podujatí) alebo projekty do
            termínu. Uvidíš zárobky, výdavky aj čas na prípravu a cestu priamo v rozvrhu.
          </p>
          <button className="btn btn-primary" onClick={enable}>
            Zapnúť freelance mód
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
          <h1 className="toolbar-title">Freelance</h1>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={() => editor.editGig({ mode: other })}>
            {other === 'event' ? 'Nová akcia' : 'Nový projekt'}
          </button>
          <button className="btn btn-primary" onClick={() => editor.editGig({ mode: defaultMode })}>
            {defaultMode === 'event' ? 'Nová akcia' : 'Nový projekt'}
          </button>
        </div>
      </header>

      <section className="ledger" aria-label={`Prehľad za ${fmt(month, 'LLLL yyyy')}`}>
        <div className="ledger-month">
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Predchádzajúci mesiac">
            <Chevron dir="left" />
          </button>
          <span>{fmt(month, 'LLLL yyyy')}</span>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Ďalší mesiac">
            <Chevron dir="right" />
          </button>
        </div>
        <dl className="ledger-rows">
          <div>
            <dt>Zárobok</dt>
            <dd>{fmtMoney(earned)}</dd>
          </div>
          <div>
            <dt>Výdavky</dt>
            <dd>−{fmtMoney(spent)}</dd>
          </div>
          <div className="is-net">
            <dt>Čistý zisk</dt>
            <dd className={earned - spent < 0 ? 'is-loss' : undefined}>{fmtMoney(earned - spent)}</dd>
          </div>
          <div className="is-owed">
            <dt>Čaká na platbu</dt>
            <dd>
              {fmtMoney(owed)}
              {unpaid.length > 0 && <small> ({unpaid.length})</small>}
            </dd>
          </div>
        </dl>
      </section>

      <div className="freelance-filters">
        <div className="segmented small" role="radiogroup" aria-label="Zobraziť">
          {(
            [
              ['month', 'Tento mesiac'],
              ['unpaid', `Na platbu${unpaid.length ? ` (${unpaid.length})` : ''}`],
              ['all', 'Celá história'],
            ] as [Tab, string][]
          ).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={tab === v} onClick={() => setTab(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="segmented small" role="radiogroup" aria-label="Druh">
          {(
            [
              ['all', 'Všetky druhy'],
              ['event', 'Akcie'],
              ['project', 'Projekty'],
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
              ? 'Nikto ti nič nedlží.'
              : tab === 'month'
                ? `V ${fmt(month, 'LLLL')} zatiaľ nič.`
                : 'Zatiaľ žiadna freelance práca.'}{' '}
            Pridaj akciu s časom a miestom alebo projekt s termínom.
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

function GigRow({ gig: g }: { gig: Gig }) {
  const { sessions, update, categories, dropSuggestions } = useData();
  const editor = useEditor();
  const notify = useToast();
  const net = gigNet(g, sessions);
  const spent = gigExpenses(g);
  const past = g.mode === 'event' ? new Date(g.ends_at!) < new Date() : false;
  const color = categories.find((c) => c.name === FREELANCE_CATEGORY)?.color ?? FREELANCE_COLOR;

  const setStatus = async (status: Gig['status']) => {
    const ok = await update('gigs', g.id, {
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    });
    // finished project work leaves the planner
    if (ok && g.task_id) {
      await update('tasks', g.task_id, { status: 'done', completed_at: new Date().toISOString() });
      await dropSuggestions(g.task_id);
    }
    if (ok) notify(status === 'paid' ? `Zaplatené: ${g.title}` : `Hotovo: ${g.title}`, 'success');
  };

  return (
    <li className={`gig-row status-${g.status}`} style={{ '--c': color } as CSSProperties}>
      <button className="gig-main" onClick={() => editor.editGig(g)}>
        <span className="gig-title">{g.title}</span>
        <span className="gig-meta">
          <span className={`gig-mode mode-${g.mode}`}>{GIG_MODES[g.mode].label}</span>
          {g.mode === 'event' && g.starts_at && g.ends_at && (
            <span>
              {fmtTime(g.starts_at)}–{fmtTime(g.ends_at)}
              {g.prep_minutes + g.travel_minutes > 0 ? `, odchod ${fmtTime(new Date(new Date(g.starts_at).getTime() - (g.prep_minutes + g.travel_minutes) * 60000))}` : ''}
            </span>
          )}
          {g.mode === 'project' && g.deadline && <span>odovzdať {relativeDeadline(g.deadline)}</span>}
          {g.location && <span>{g.location}</span>}
          {g.client && <span>{g.client}</span>}
        </span>
        <span className="gig-status">{GIG_STATUS[g.status]}</span>
      </button>
      <div className="gig-money">
        <b className={net < 0 ? 'is-loss' : undefined}>{fmtMoney(net)}</b>
        {spent > 0 && <span>výdavky {fmtMoney(spent)}</span>}
        {(g.status === 'planned' || g.status === 'confirmed') && (past || g.mode === 'project') && (
          <button className="btn btn-ghost btn-small" onClick={() => setStatus('done')}>
            Hotovo
          </button>
        )}
        {g.status === 'done' && (
          <button className="btn btn-primary btn-small" onClick={() => setStatus('paid')}>
            Zaplatené
          </button>
        )}
      </div>
    </li>
  );
}
