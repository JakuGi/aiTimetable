import { useEffect, useMemo, useState } from 'react';
import { isSameDay } from 'date-fns';
import { useData } from '../lib/data';
import { useGender } from '../lib/gender';
import { t } from '../lib/i18n';
import { fmtDuration, fmtTime, weekDays, weekStart, weekdayLong, weekdayShort } from '../lib/time';

const AMOUNTS = [0, 30, 60, 90, 120, 180];

/**
 * Free time is only what the user draws into the week (Vyhradiť voľno). On top of that the
 * planner can leave gaps between work blocks; this is where that amount is set.
 */
export function LeisureSettings() {
  const { profile, update, free_blocks } = useData();
  const [minutes, setMinutes] = useState(profile?.leisure_minutes_per_day ?? 0);
  const g = useGender();

  useEffect(() => setMinutes(profile?.leisure_minutes_per_day ?? 0), [profile?.leisure_minutes_per_day]);

  const week = useMemo(() => weekDays(weekStart(new Date())), []);
  const drawn = useMemo(
    () =>
      week.map((d) =>
        free_blocks
          .filter((f) => isSameDay(new Date(f.starts_at), d))
          .map((f) => `${fmtTime(f.starts_at)}–${fmtTime(f.ends_at)}`),
      ),
    [week, free_blocks],
  );

  if (!profile) return null;

  const save = async (v: number) => {
    const prev = minutes;
    setMinutes(v);
    if (!(await update('profiles', profile.id, { leisure_minutes_per_day: v }))) setMinutes(prev);
  };

  return (
    <section className="card-section leisure-settings">
      <h2>{t('Voľný čas')}</h2>
      <p className="muted small">
        {g(
          'Voľno si nakreslíš sám v Môj týždeň tlačidlom Vyhradiť voľno.',
          'Voľno si nakreslíš sama v Môj týždeň tlačidlom Vyhradiť voľno.',
        )}{' '}
        {t('Plánovač doň prácu nedá a siahne doň až úplne nakoniec, keď by sa termín inak nestihol (a povie ti to).')}
      </p>

      <div className="field">
        <span className="field-label">{t('Voľno medzi prácou')}</span>
        <div className="chips" role="group" aria-label={t('Voľno medzi prácou')}>
          {AMOUNTS.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={minutes === m} onClick={() => save(m)}>
              {m ? fmtDuration(m) : t('Žiadne')}
            </button>
          ))}
          <label className="leisure-own">
            <input
              type="number"
              min={0}
              max={480}
              step={15}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              onBlur={(e) => {
                const v = Math.min(480, Math.max(0, Math.round(Number(e.target.value) || 0)));
                if (v !== profile.leisure_minutes_per_day) save(v);
              }}
              aria-label={t('Vlastný počet minút')}
            />
            min
          </label>
        </div>
        <span className="field-hint">
          {t(
            'V dňoch s prácou nechá plánovač medzi blokmi medzery spolu aspoň na tento čas. Nakreslené voľno a udalosti typu Voľný čas sa doň rátajú.',
          )}
        </span>
      </div>

      <div className="leisure-preview">
        <span className="field-label">{t('Nakreslené voľno tento týždeň')}</span>
        <ul>
          {week.map((_, i) => (
            <li key={i}>
              <b title={weekdayLong(i)}>{weekdayShort(i)}</b>
              <span>{drawn[i].length ? drawn[i].join(', ') : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
