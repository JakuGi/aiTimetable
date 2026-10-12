import { useEffect, useState, type CSSProperties } from 'react';
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
import { notificationsSupported, requestNotifications, getSessionAlerts, setSessionAlerts } from '../lib/useReminders';
import type { ClassPeriod, GigMode, Priority } from '../lib/types';
import { Field, Segmented } from '../editor/fields';

export function SettingsPage() {
  const { profile, update, categories, insert } = useData();
  const { user } = useAuth();
  const notify = useToast();
  const [form, setForm] = useState(profile);
  const [newCat, setNewCat] = useState({ name: '', color: '#12A39A' });
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'denied');
  const [sessionAlerts, setAlerts] = useState(getSessionAlerts());

  useEffect(() => setForm(profile), [profile]);

  if (!form || !profile) return <div className="page">Načítavam…</div>;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm({ ...form, [k]: v });

  const saveProfile = async () => {
    if (form.day_end <= form.day_start) return notify('Koniec dňa musí byť po jeho začiatku.', 'error');
    const ok = await update('profiles', profile.id, {
      display_name: form.display_name?.trim() || null,
      day_start: form.day_start.slice(0, 5),
      day_end: form.day_end.slice(0, 5),
      focus_block_minutes: form.focus_block_minutes,
      break_minutes: form.break_minutes,
      max_focus_minutes_per_day: form.max_focus_minutes_per_day,
      leisure_minutes_per_day: form.leisure_minutes_per_day,
      planning_horizon_days: form.planning_horizon_days,
      priority_colors: form.priority_colors,
    });
    if (ok) notify('Nastavenia uložené.', 'success');
  };

  const addCategory = async () => {
    if (!newCat.name.trim()) return;
    const ok = await insert('categories', { name: newCat.name.trim(), color: newCat.color, sort_order: categories.length });
    if (ok) setNewCat({ name: '', color: '#12A39A' });
  };

  const num = (k: 'focus_block_minutes' | 'break_minutes' | 'max_focus_minutes_per_day' | 'leisure_minutes_per_day' | 'planning_horizon_days') => (
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
        <section className="card-section">
          <h2>Ako plánovať</h2>
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
            <Field label="Voľný čas denne (min)" hint="Plánovač ho drží večer, berie si ho len pri hroziacom termíne.">
              {num('leisure_minutes_per_day')}
            </Field>
          </div>
          <Field label="Plánovať dopredu (dni)">{num('planning_horizon_days')}</Field>

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
          <div className="actions">
            <button className="btn btn-primary" onClick={saveProfile}>
              Uložiť nastavenia
            </button>
          </div>
        </section>

        <SchoolSettings />

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
          <h2>Vzhľad a upozornenia</h2>
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
          {notificationsSupported() ? (
            <>
              <p className="small">
                {perm === 'granted'
                  ? 'Upozornenia sú povolené na tomto zariadení.'
                  : perm === 'denied'
                    ? 'Upozornenia sú v prehliadači zablokované. Povoľ ich v nastaveniach stránky.'
                    : 'Povoľ upozornenia, aby ťa appka upozornila na udalosti a pripomienky.'}
              </p>
              {perm === 'default' && (
                <button className="btn btn-ghost" onClick={async () => setPerm(await requestNotifications())}>
                  Povoliť upozornenia
                </button>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={sessionAlerts}
                  onChange={(e) => {
                    setSessionAlerts(e.target.checked);
                    setAlerts(e.target.checked);
                  }}
                />
                Upozorniť aj na začiatok naplánovaného bloku práce
              </label>
            </>
          ) : (
            <p className="small muted">Tento prehliadač nepodporuje upozornenia.</p>
          )}
        </section>

        <section className="card-section">
          <h2>Účet</h2>
          <Field label="Meno">
            <input value={form.display_name ?? ''} onChange={(e) => set('display_name', e.target.value)} maxLength={80} />
          </Field>
          <p className="small muted">Prihlásený ako {user?.email}</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={saveProfile}>
              Uložiť meno
            </button>
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
              Odhlásiť sa
            </button>
          </div>
        </section>
      </div>
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
function SchoolSettings() {
  const { profile, update } = useData();
  const notify = useToast();
  const [periods, setPeriods] = useState<ClassPeriod[]>(profile?.class_periods ?? DEFAULT_CLASS_PERIODS);
  useEffect(() => setPeriods(profile?.class_periods ?? DEFAULT_CLASS_PERIODS), [profile?.class_periods]);
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
    setPeriods((ps) => ps.map((x, j) => (j === i ? { ...x, [field]: v } : x)));

  const addPeriod = () => {
    const last = periods[periods.length - 1];
    const start = last ? Math.min(timeToMinutes(last.end) + 10, 23 * 60) : 8 * 60;
    setPeriods([...periods, { start: minutesToTime(start), end: minutesToTime(Math.min(start + 45, 23 * 60 + 59)) }]);
  };

  const savePeriods = async () => {
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i];
      if (timeToMinutes(p.end) <= timeToMinutes(p.start)) return notify(`${i + 1}. hodina: koniec musí byť po začiatku.`, 'error');
      if (i > 0 && timeToMinutes(p.start) < timeToMinutes(periods[i - 1].end))
        return notify(`${i + 1}. hodina začína skôr, než skončí ${i}.`, 'error');
    }
    if (await update('profiles', profile.id, { class_periods: periods })) notify('Zvonenie uložené.', 'success');
  };

  return (
    <section className="card-section">
      <h2>Škola</h2>
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
        <button className="btn btn-primary" onClick={savePeriods}>
          Uložiť zvonenie
        </button>
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
