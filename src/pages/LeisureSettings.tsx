import { useEffect, useMemo, useState } from 'react';
import { useData } from '../lib/data';
import { LEISURE_WHEN, leisureBands } from '../lib/leisure';
import { leisureRule } from '../lib/planner';
import { fmtDuration, fmtTime, WEEKDAY_LONG, WEEKDAY_SHORT, weekDays, weekStart } from '../lib/time';
import type { LeisureDay, LeisureMode, LeisureWhen, Profile } from '../lib/types';

type Prefs = Pick<Profile, 'leisure_when' | 'leisure_start' | 'leisure_minutes_per_day' | 'leisure_days' | 'leisure_auto'>;

const AMOUNTS = [30, 60, 90, 120, 180];
const DAY_AMOUNTS = [30, 45, 60, 90, 120, 180, 240];
const MODES: { value: LeisureMode; label: string; hint: string }[] = [
  ...LEISURE_WHEN,
  { value: 'per_day', label: 'Každý deň inak', hint: 'pre každý deň zvlášť kedy a koľko, alebo deň bez voľna' },
];
const short = (t: string | null) => (t ?? '18:00').slice(0, 5);

/** When and how much free time the planner keeps empty each day. */
export function LeisureSettings() {
  const data = useData();
  const { profile, update } = data;
  const [prefs, setPrefs] = useState<Prefs | null>(profile);

  useEffect(() => setPrefs(profile), [profile]);

  const week = useMemo(() => weekDays(weekStart(new Date())), []);
  const preview = useMemo(() => {
    if (!profile || !prefs) return [];
    const p = { ...profile, ...prefs };
    const bands = leisureBands(
      week,
      {
        profile: p,
        routine: data.routine_blocks,
        events: data.events,
        sessions: data.sessions,
        gigs: p.freelance_enabled ? data.gigs : [],
        freeBlocks: data.free_blocks,
      },
      { includePast: true, now: new Date(0) },
    );
    return week.map((d, i) => ({ i, rule: leisureRule(p, d), bands: bands.filter((b) => b.day === d) }));
  }, [profile, prefs, week, data.routine_blocks, data.events, data.sessions, data.gigs, data.free_blocks]);

  if (!profile || !prefs) return null;

  const save = async (patch: Partial<Prefs>) => {
    const prev = prefs;
    setPrefs({ ...prefs, ...patch });
    if (!(await update('profiles', profile.id, patch))) setPrefs(prev);
  };

  const fullDays = (): LeisureDay[] =>
    prefs.leisure_days.length === 7
      ? prefs.leisure_days
      : Array.from({ length: 7 }, () => ({
          when: prefs.leisure_when === 'per_day' ? 'evening' : prefs.leisure_when,
          start: prefs.leisure_when === 'custom' ? short(prefs.leisure_start) : null,
          minutes: prefs.leisure_minutes_per_day,
        }));

  const setMode = (m: LeisureMode) =>
    save(m === 'per_day' ? { leisure_when: m, leisure_days: fullDays() } : { leisure_when: m });

  const setDay = (i: number, patch: Partial<LeisureDay>) => {
    const days = fullDays().map((d, j) => (j === i ? { ...d, ...patch } : d));
    save({ leisure_days: days });
  };

  const perDay = prefs.leisure_when === 'per_day';

  return (
    <section className="card-section leisure-settings">
      <h2>Voľný čas</h2>
      <p className="muted small">
        Nie je to blok v kalendári, ale okno, ktoré plánovač nechá prázdne. V rozvrhu ho uvidíš ako jemný zelený pás.
        Prácu doň dá, len keď by inak nestihol termín. Keď si voľno zapíšeš sám (udalosť alebo blok v Môj týždeň typu
        Voľný čas), okno sa o ten čas skráti.
      </p>

      <div className="field">
        <span className="field-label">Kto ho určuje</span>
        <div className="leisure-modes two" role="radiogroup" aria-label="Kto určuje voľný čas">
          <button
            type="button"
            role="radio"
            aria-checked={prefs.leisure_auto}
            className="leisure-mode"
            onClick={() => save({ leisure_auto: true })}
          >
            <b>Automaticky</b>
            <span>plánovač drží zelené okno podľa nastavenia nižšie, a k tomu aj voľno, ktoré si nakreslíš</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!prefs.leisure_auto}
            className="leisure-mode"
            onClick={() => save({ leisure_auto: false })}
          >
            <b>Sám si ho nakreslím</b>
            <span>
              drží sa len voľno nakreslené v Rozvrhu (tlačidlo Vyhradiť voľno); zelené okná ostanú ako tip, kam by sa
              hodilo
            </span>
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field-label">{prefs.leisure_auto ? 'Kedy ho chceš' : 'Kde ti ho ukazovať ako tip'}</span>
        <div className="leisure-modes" role="radiogroup" aria-label="Kedy chceš voľný čas">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={prefs.leisure_when === m.value}
              className="leisure-mode"
              onClick={() => setMode(m.value)}
            >
              <b>{m.label}</b>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {prefs.leisure_when === 'custom' && (
        <label className="field leisure-inline">
          <span className="field-label">Od</span>
          <input
            type="time"
            value={short(prefs.leisure_start)}
            onChange={(e) => e.target.value && save({ leisure_start: e.target.value })}
          />
        </label>
      )}

      {!perDay && (
        <div className="field">
          <span className="field-label">Koľko denne</span>
          <div className="chips" role="group" aria-label="Koľko voľného času denne">
            {AMOUNTS.map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                aria-pressed={prefs.leisure_minutes_per_day === m}
                onClick={() => save({ leisure_minutes_per_day: m })}
              >
                {fmtDuration(m)}
              </button>
            ))}
            <label className="leisure-own">
              <input
                type="number"
                min={0}
                max={480}
                step={15}
                value={prefs.leisure_minutes_per_day}
                onChange={(e) => setPrefs({ ...prefs, leisure_minutes_per_day: Number(e.target.value) })}
                onBlur={(e) => {
                  const v = Math.min(480, Math.max(0, Math.round(Number(e.target.value) || 0)));
                  if (v !== profile.leisure_minutes_per_day) save({ leisure_minutes_per_day: v });
                }}
                aria-label="Vlastný počet minút"
              />
              min
            </label>
          </div>
        </div>
      )}

      {perDay && (
        <div className="leisure-days">
          {fullDays().map((d, i) => (
            <div key={i} className="leisure-day">
              <span className="leisure-day-name" title={WEEKDAY_LONG[i]}>
                {WEEKDAY_SHORT[i]}
              </span>
              <select
                value={d.when}
                onChange={(e) => {
                  const when = e.target.value as LeisureWhen | 'off';
                  setDay(i, { when, start: when === 'custom' ? short(d.start) : d.start });
                }}
                aria-label={`${WEEKDAY_LONG[i]}: kedy`}
              >
                {LEISURE_WHEN.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
                <option value="off">Bez voľna</option>
              </select>
              {d.when === 'custom' && (
                <input
                  type="time"
                  value={short(d.start)}
                  onChange={(e) => e.target.value && setDay(i, { start: e.target.value })}
                  aria-label={`${WEEKDAY_LONG[i]}: od`}
                />
              )}
              {d.when !== 'off' && (
                <select
                  value={d.minutes}
                  onChange={(e) => setDay(i, { minutes: Number(e.target.value) })}
                  aria-label={`${WEEKDAY_LONG[i]}: koľko`}
                >
                  {[...new Set([...DAY_AMOUNTS, d.minutes])]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <option key={m} value={m}>
                        {fmtDuration(m)}
                      </option>
                    ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="leisure-preview">
        <span className="field-label">Tento týždeň podľa rozvrhu</span>
        <ul>
          {preview.map(({ i, rule, bands }) => (
            <li key={i}>
              <b>{WEEKDAY_SHORT[i]}</b>
              <span>
                {rule.when === 'off' || rule.minutes < 15
                  ? 'bez voľna'
                  : rule.when === 'flexible'
                    ? `${fmtDuration(rule.minutes)} medzi prácou`
                    : bands.length
                      ? bands.map((b) => `${fmtTime(b.start)}–${fmtTime(b.end)}`).join(', ')
                      : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
