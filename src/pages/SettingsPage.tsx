import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { ColorSwatches } from '../components/ColorSwatches';
import { useToast } from '../components/Toast';
import { addDays } from 'date-fns';
import { DEFAULT_CLASS_PERIODS, DEFAULT_PRIORITY_COLORS, PRIORITY_LABELS } from '../lib/meta';
import { FREELANCE_CATEGORY, FREELANCE_COLOR, GIG_MODES } from '../lib/freelance';
import { fmt, fmtDuration, minutesToTime, timeToMinutes, toDateInput, weekParity, weekStart } from '../lib/time';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { disablePush } from '../lib/push';
import { NotificationSettings } from './NotificationSettings';
import { LeisureSettings } from './LeisureSettings';
import type { ClassPeriod, GigMode, Priority, Profile } from '../lib/types';
import { Field, Segmented } from '../editor/fields';
import { GENDER_OPTIONS, useGender } from '../lib/gender';

/** Settings saved with a button; everything else on the page saves the moment it changes. */
const EDITABLE = {
  day_start: 'Začiatok dňa',
  day_end: 'Koniec dňa',
  focus_block_minutes: 'Dĺžka bloku práce',
  break_minutes: 'Prestávka po bloku',
  max_focus_minutes_per_day: 'Najviac práce za deň',
  planning_horizon_days: 'Plánovať dopredu',
  priority_colors: 'Farby dôležitosti',
  display_name: 'Meno',
} as const;
type EditableKey = keyof typeof EDITABLE;
type Draft = Partial<Pick<Profile, EditableKey>>;
const PLANNING_KEYS: EditableKey[] = [
  'day_start',
  'day_end',
  'focus_block_minutes',
  'break_minutes',
  'max_focus_minutes_per_day',
  'planning_horizon_days',
  'priority_colors',
];

/** what gets stored, so "08:00" and "08:00:00" or "Ján " and "Ján" don't count as a change */
const stored = (k: EditableKey, v: unknown) =>
  JSON.stringify(
    k === 'day_start' || k === 'day_end' ? String(v).slice(0, 5) : k === 'display_name' ? (String(v ?? '').trim() || null) : v,
  );

export function SettingsPage() {
  const { profile, update, categories, insert } = useData();
  const { user } = useAuth();
  const notify = useToast();
  // only what the user changed; other fields keep following the saved profile (and realtime updates)
  const [draft, setDraft] = useState<Draft>({});
  const [periodsDraft, setPeriodsDraft] = useState<ClassPeriod[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', color: '#12A39A' });
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const g = useGender();

  const changed = profile
    ? (Object.keys(draft) as EditableKey[]).filter((k) => stored(k, draft[k]) !== stored(k, profile[k]))
    : [];
  const savedPeriods = profile?.class_periods ?? DEFAULT_CLASS_PERIODS;
  const periodsChanged = periodsDraft !== null && JSON.stringify(periodsDraft) !== JSON.stringify(savedPeriods);
  const dirty = changed.length > 0 || periodsChanged;
  const changedLabels = [...changed.map((k) => EDITABLE[k]), ...(periodsChanged ? ['Zvonenie'] : [])];

  // leaving the page (link, back button) with unsaved changes asks first
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  // closing the tab or reloading: the browser's own warning
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!profile) return <div className="page">Načítavam…</div>;
  const form = { ...profile, ...draft };
  const periods = periodsDraft ?? savedPeriods;

  const set = <K extends EditableKey>(k: K, v: Profile[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const discard = () => {
    setDraft({});
    setPeriodsDraft(null);
  };

  const saveAll = async (): Promise<boolean> => {
    if (!dirty) return true;
    if (form.day_end.slice(0, 5) <= form.day_start.slice(0, 5)) {
      notify('Koniec dňa musí byť po jeho začiatku.', 'error');
      return false;
    }
    if (periodsChanged) {
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        if (timeToMinutes(p.end) <= timeToMinutes(p.start)) {
          notify(`Zvonenie, ${i + 1}. hodina: koniec musí byť po začiatku.`, 'error');
          return false;
        }
        if (i > 0 && timeToMinutes(p.start) < timeToMinutes(periods[i - 1].end)) {
          notify(`Zvonenie: ${i + 1}. hodina začína skôr, než skončí ${i}.`, 'error');
          return false;
        }
      }
    }
    const patch: Partial<Profile> = {};
    for (const k of changed) (patch as Record<string, unknown>)[k] = JSON.parse(stored(k, form[k]));
    if (periodsChanged) patch.class_periods = periods;
    setSaving(true);
    const ok = await update('profiles', profile.id, patch);
    setSaving(false);
    if (!ok) return false;
    discard();
    notify('Nastavenia uložené.', 'success');
    return true;
  };

  const planningDirty = changed.some((k) => PLANNING_KEYS.includes(k));
  const saveButton = (
    <button className={`btn btn-primary${dirty ? ' needs-save' : ''}`} onClick={saveAll} disabled={!dirty || saving}>
      {saving ? 'Ukladám…' : dirty ? 'Uložiť nastavenia' : 'Všetko uložené'}
    </button>
  );

  const addCategory = async () => {
    if (!newCat.name.trim()) return;
    const ok = await insert('categories', { name: newCat.name.trim(), color: newCat.color, sort_order: categories.length });
    if (ok) setNewCat({ name: '', color: '#12A39A' });
  };

  const num = (k: 'focus_block_minutes' | 'break_minutes' | 'max_focus_minutes_per_day' | 'planning_horizon_days') => (
    <input type="number" value={form[k]} onChange={(e) => set(k, Number(e.target.value))} />
  );

  return (
    <div className="page page-settings">
      <header className="toolbar">
        <div className="toolbar-nav">
          <h1 className="toolbar-title">Nastavenia</h1>
        </div>
      </header>

      <div className="settings">
        <section className={`card-section${planningDirty ? ' is-dirty' : ''}`}>
          <h2>
            Ako plánovať {planningDirty && <span className="unsaved-tag">neuložené</span>}
          </h2>
          <div className="row-2">
            <Field label="Deň začína o">
              <input type="time" value={form.day_start.slice(0, 5)} onChange={(e) => set('day_start', e.target.value)} />
            </Field>
            <Field label="Deň končí o">
              <input type="time" value={form.day_end.slice(0, 5)} onChange={(e) => set('day_end', e.target.value)} />
            </Field>
          </div>
          <div className="row-2">
            <Field label="Dĺžka jedného bloku práce (min)" hint={`Teraz ${fmtDuration(form.focus_block_minutes)}.`}>
              {num('focus_block_minutes')}
            </Field>
            <Field label="Prestávka po bloku (min)">{num('break_minutes')}</Field>
          </div>
          <div className="row-2">
            <Field label="Najviac práce za deň (min)" hint={`Teraz ${fmtDuration(form.max_focus_minutes_per_day)}.`}>
              {num('max_focus_minutes_per_day')}
            </Field>
            <Field label="Plánovať dopredu (dni)">{num('planning_horizon_days')}</Field>
          </div>

          <h3>Farby dôležitosti</h3>
          {([1, 2, 3, 4] as Priority[]).map((p) => (
            <div key={p} className="prio-color-row">
              <span className="prio-name" style={{ '--c': form.priority_colors[p - 1] } as CSSProperties}>
                {PRIORITY_LABELS[p]}
              </span>
              <ColorSwatches
                label={`Farba: ${PRIORITY_LABELS[p]}`}
                value={form.priority_colors[p - 1]}
                onChange={(c) => {
                  const next = [...form.priority_colors];
                  next[p - 1] = c ?? DEFAULT_PRIORITY_COLORS[p - 1];
                  set('priority_colors', next);
                }}
              />
            </div>
          ))}
          <div className="actions">{saveButton}</div>
        </section>

        <LeisureSettings />

        <SchoolSettings periods={periods} onChange={setPeriodsDraft} dirty={periodsChanged} saveButton={saveButton} />

        <FreelanceSettings />

        <section className="card-section">
          <h2>Kategórie</h2>
          <ul className="cat-list">
            {categories.map((c) => (
              <li key={c.id}>
                <CategoryRow id={c.id} />
              </li>
            ))}
          </ul>
          <div className="cat-new">
            <input
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              placeholder="Nová kategória, napr. Krúžok"
              maxLength={60}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <ColorSwatches label="Farba novej kategórie" value={newCat.color} onChange={(c) => setNewCat({ ...newCat, color: c ?? '#12A39A' })} />
            <button className="btn btn-ghost" onClick={addCategory}>
              Pridať kategóriu
            </button>
          </div>
          <p className="small muted">Odstránenie kategórie nezmaže úlohy ani udalosti, len im zruší kategóriu.</p>
        </section>

        <section className="card-section">
          <h2>Vzhľad</h2>
          <Field label="Téma">
            <Segmented
              label="Téma"
              value={theme}
              onChange={(t) => {
                setTheme(t);
                setThemeState(t);
              }}
              options={[
                { value: 'auto', label: 'Podľa systému' },
                { value: 'light', label: 'Svetlá' },
                { value: 'dark', label: 'Tmavá' },
              ]}
            />
          </Field>
        </section>

        <NotificationSettings />

        <section className={`card-section${changed.includes('display_name') ? ' is-dirty' : ''}`}>
          <h2>
            Účet {changed.includes('display_name') && <span className="unsaved-tag">neuložené</span>}
          </h2>
          <Field label="Meno">
            <input value={form.display_name ?? ''} onChange={(e) => set('display_name', e.target.value)} maxLength={80} />
          </Field>
          <div className="field">
            <span className="field-label">Oslovovanie</span>
            <div className="gender-pick in-settings" role="radiogroup" aria-label="Oslovovanie">
              {GENDER_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={profile.gender === o.value}
                  className="gender-option"
                  onClick={() => profile.gender !== o.value && update('profiles', profile.id, { gender: o.value })}
                >
                  <b>{o.label}</b>
                  <span>{o.example}</span>
                </button>
              ))}
            </div>
            <span className="field-hint">
              Ako ťa appka oslovuje v tlačidlách a správach. Ukladá sa hneď
              {profile.gender ? '' : ', zatiaľ nie je vybrané'}.
            </span>
          </div>
          <p className="small muted">
            {g('Prihlásený', 'Prihlásená')} ako {user?.email}
          </p>
          <div className="actions">
            {saveButton}
            <button
              className="btn btn-ghost"
              onClick={async () => {
                // this device must stop receiving the account's notifications
                await disablePush().catch(() => {});
                await supabase.auth.signOut();
              }}
            >
              Odhlásiť sa
            </button>
          </div>
        </section>
      </div>

      {dirty && (
        <div className="save-bar" role="region" aria-label="Neuložené zmeny">
          <span className="save-dot" aria-hidden="true" />
          <p>
            <b>Neuložené zmeny</b>
            <span>{changedLabels.join(', ')}</span>
          </p>
          <button className="btn btn-ghost" onClick={discard} disabled={saving}>
            Zahodiť
          </button>
          <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? 'Ukladám…' : 'Uložiť nastavenia'}
          </button>
        </div>
      )}

      {blocker.state === 'blocked' && (
        <Modal
          title="Neuložené nastavenia"
          onClose={() => blocker.reset()}
          footer={
            <>
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={() => {
                  discard();
                  blocker.proceed();
                }}
              >
                Zahodiť zmeny
              </button>
              <span className="spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => blocker.reset()}>
                Zostať
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={async () => {
                  if (await saveAll()) blocker.proceed();
                  else blocker.reset();
                }}
              >
                Uložiť a odísť
              </button>
            </>
          }
        >
          <p>
            {g('Zmenil si', 'Zmenila si')} nastavenia, ktoré ešte nie sú uložené:
          </p>
          <ul className="unsaved-list">
            {changedLabels.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="muted small">Chceš ich pred odchodom uložiť, alebo zahodiť?</p>
        </Modal>
      )}
    </div>
  );
}

function CategoryRow({ id }: { id: string }) {
  const { categoryById, update, remove } = useData();
  const c = categoryById(id);
  const [name, setName] = useState(c?.name ?? '');
  if (!c) return null;
  return (
    <div className="cat-row" style={{ '--c': c.color } as CSSProperties}>
      <i className="dot" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== c.name && update('categories', c.id, { name: name.trim() })}
        aria-label="Názov kategórie"
        maxLength={60}
      />
      <ColorSwatches label={`Farba ${c.name}`} value={c.color} onChange={(col) => col && update('categories', c.id, { color: col })} />
      <button className="btn btn-danger-ghost" onClick={() => remove('categories', c.id)}>
        Odstrániť
      </button>
    </div>
  );
}

/** Bell schedule and odd/even weeks: the two things that make entering classes fast. */
function SchoolSettings({
  periods,
  onChange: setPeriods,
  dirty,
  saveButton,
}: {
  periods: ClassPeriod[];
  onChange: (p: ClassPeriod[]) => void;
  dirty: boolean;
  saveButton: ReactNode;
}) {
  const { profile, update } = useData();
  const notify = useToast();
  if (!profile) return null;

  const thisMonday = weekStart(new Date());
  const parity = weekParity(new Date(), profile.odd_week_anchor);

  const setParity = async (p: 'odd' | 'even') => {
    if (p === parity) return;
    const anchor = p === 'odd' ? thisMonday : addDays(thisMonday, -7);
    if (await update('profiles', profile.id, { odd_week_anchor: toDateInput(anchor) })) {
      notify(`Tento týždeň je teraz ${p === 'odd' ? 'nepárny' : 'párny'}.`, 'success');
    }
  };

  const setPeriod = (i: number, field: keyof ClassPeriod, v: string) =>
    setPeriods(periods.map((x, j) => (j === i ? { ...x, [field]: v } : x)));

  const addPeriod = () => {
    const last = periods[periods.length - 1];
    const start = last ? Math.min(timeToMinutes(last.end) + 10, 23 * 60) : 8 * 60;
    setPeriods([...periods, { start: minutesToTime(start), end: minutesToTime(Math.min(start + 45, 23 * 60 + 59)) }]);
  };

  return (
    <section className={`card-section${dirty ? ' is-dirty' : ''}`}>
      <h2>Škola {dirty && <span className="unsaved-tag">neuložené zvonenie</span>}</h2>
      <Field label={`Tento týždeň (${fmt(thisMonday, 'd. M.')} – ${fmt(addDays(thisMonday, 6), 'd. M.')}) je`}>
        <Segmented
          label="Párnosť tohto týždňa"
          value={parity}
          onChange={setParity}
          options={[
            { value: 'odd', label: 'Nepárny' },
            { value: 'even', label: 'Párny' },
          ]}
        />
      </Field>
      <p className="small muted">Ďalšie týždne sa striedajú samé, aj cez nový rok.</p>

      <h3>Zvonenie</h3>
      <p className="small muted">Podľa týchto časov sa vypĺňa tabuľka rozvrhu hodín.</p>
      <ol className="bells">
        {periods.map((p, i) => (
          <li key={i}>
            <b>{i + 1}.</b>
            <input type="time" value={p.start} onChange={(e) => setPeriod(i, 'start', e.target.value)} aria-label={`${i + 1}. hodina od`} />
            <span>–</span>
            <input type="time" value={p.end} onChange={(e) => setPeriod(i, 'end', e.target.value)} aria-label={`${i + 1}. hodina do`} />
            <button
              type="button"
              className="btn btn-danger-ghost"
              onClick={() => setPeriods(periods.filter((_, j) => j !== i))}
              aria-label={`Odstrániť ${i + 1}. hodinu`}
            >
              Odstrániť
            </button>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button className="btn btn-ghost" onClick={addPeriod} disabled={periods.length >= 16}>
          Pridať hodinu
        </button>
        <button className="btn btn-ghost" onClick={() => setPeriods(DEFAULT_CLASS_PERIODS)}>
          Predvolené zvonenie
        </button>
        {saveButton}
      </div>
    </section>
  );
}

/** Freelance mode: an extra tab for paid gigs, off unless the user wants it. */
function FreelanceSettings() {
  const { profile, update, categories, insert } = useData();
  const notify = useToast();
  // flips immediately; the saved value catches up (or rolls it back on error)
  const [enabled, setEnabled] = useState(profile?.freelance_enabled ?? false);
  useEffect(() => setEnabled(profile?.freelance_enabled ?? false), [profile?.freelance_enabled]);
  if (!profile) return null;

  const toggle = async (on: boolean) => {
    setEnabled(on);
    if (on && !categories.some((c) => c.name === FREELANCE_CATEGORY)) {
      await insert('categories', { name: FREELANCE_CATEGORY, color: FREELANCE_COLOR, sort_order: categories.length });
    }
    const ok = await update('profiles', profile.id, { freelance_enabled: on });
    if (!ok) setEnabled(!on);
    if (ok) {
      notify(on ? 'Freelance mód zapnutý. Nájdeš ho v novej záložke.' : 'Freelance mód vypnutý. Dáta ostávajú uložené.', 'success');
    }
  };

  return (
    <section className="card-section">
      <h2>Freelance</h2>
      <label className="switch-row">
        <span>
          <b>Freelance mód</b>
          <span className="small muted">
            Záložka na brigády a zákazky: zárobky, výdavky, príprava a cesta. Akcie sa ukážu v rozvrhu a plánovač ich
            obíde.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
        />
      </label>
      {enabled && (
        <Field label="Čo robíš najčastejšie" hint={GIG_MODES[profile.freelance_default_mode].hint}>
          <Segmented
            label="Predvolený druh"
            value={profile.freelance_default_mode}
            onChange={(m: GigMode) => update('profiles', profile.id, { freelance_default_mode: m })}
            options={[
              { value: 'event', label: 'Akcie na mieste' },
              { value: 'project', label: 'Projekty do termínu' },
            ]}
          />
        </Field>
      )}
    </section>
  );
}
