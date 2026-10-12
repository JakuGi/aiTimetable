import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useData } from '../lib/data';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import {
  currentSubscription,
  disablePush,
  enablePush,
  isIOS,
  pushSupport,
  sendTestPush,
} from '../lib/push';
import { fmt } from '../lib/time';
import type { Profile } from '../lib/types';

interface Device {
  id: string;
  endpoint: string;
  device: string | null;
  created_at: string;
  last_success_at: string | null;
}

type Prefs = Pick<
  Profile,
  | 'notify_events'
  | 'notify_sessions'
  | 'session_lead_minutes'
  | 'notify_gigs'
  | 'notify_deadlines'
  | 'deadline_lead_hours'
  | 'notify_summary'
  | 'summary_time'
  | 'quiet_enabled'
  | 'quiet_from'
  | 'quiet_to'
>;

const SESSION_LEADS = [0, 5, 10, 15];
const DEADLINE_LEADS = [
  { value: 2, label: '2 h vopred' },
  { value: 6, label: '6 h vopred' },
  { value: 24, label: 'deň vopred' },
  { value: 48, label: '2 dni vopred' },
];
const short = (t: string) => t.slice(0, 5);

export function NotificationSettings() {
  const { profile, update } = useData();
  const notify = useToast();
  const support = pushSupport();
  const [permission, setPermission] = useState<NotificationPermission | 'n/a'>(() =>
    'Notification' in window ? Notification.permission : 'n/a',
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(profile);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) return setCountdown(null);
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => setPrefs(profile), [profile]);

  const refresh = useCallback(async () => {
    const sub = await currentSubscription();
    setEndpoint(sub?.endpoint ?? null);
    const { data } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, device, created_at, last_success_at')
      .order('created_at');
    setDevices(data ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // keep the server's idea of "7:00" in the user's real time zone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (profile && tz && profile.timezone !== tz) update('profiles', profile.id, { timezone: tz });
  }, [profile, update]);

  if (!profile || !prefs) return null;
  const subscribed = Boolean(endpoint && devices.some((d) => d.endpoint === endpoint));

  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    if ('Notification' in window) setPermission(Notification.permission);
    if (r.ok) notify('Upozornenia na tomto zariadení sú zapnuté.', 'success');
    else if (r.reason === 'denied') notify('Upozornenia sú zablokované. Povoľ ich v nastaveniach prehliadača alebo telefónu.', 'error');
    else if (r.reason === 'error') notify(`Nepodarilo sa zapnúť upozornenia: ${r.message}`, 'error');
    refresh();
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    notify('Toto zariadenie už upozornenia nedostane.', 'info');
    refresh();
  };

  const removeDevice = async (d: Device) => {
    if (d.endpoint === endpoint) return turnOff();
    await supabase.from('push_subscriptions').delete().eq('id', d.id);
    refresh();
  };

  const test = async (delaySeconds = 0) => {
    setBusy(true);
    const r = await sendTestPush(delaySeconds);
    setBusy(false);
    if ('error' in r) return notify(`Test zlyhal: ${r.error}`, 'error');
    if (r.devices === 0) return notify('Žiadne zariadenie nemá zapnuté upozornenia. Najprv ich zapni.', 'info');
    if ('scheduled' in r) {
      setCountdown(r.delaySeconds);
      return notify(`Notifikácia príde o ${r.delaySeconds} s. Teraz appku úplne zavri (aj zo zoznamu otvorených aplikácií) a počkaj.`, 'success');
    }
    notify(
      r.failed
        ? `Odoslané na ${r.sent} z ${r.devices} zariadení. Ostatné sa nepodarilo zastihnúť.`
        : `Odoslané na ${r.sent} ${r.sent === 1 ? 'zariadenie' : r.sent < 5 ? 'zariadenia' : 'zariadení'}. Malo by prísť o pár sekúnd.`,
      r.failed ? 'info' : 'success',
    );
    refresh();
  };

  /** Settings switch at once and save in the background. */
  const set = async <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    const prev = prefs[key];
    setPrefs({ ...prefs, [key]: value });
    if (!(await update('profiles', profile.id, { [key]: value }))) setPrefs((p) => (p ? { ...p, [key]: prev } : p));
  };

  return (
    <section className="card-section notif-settings">
      <h2>Upozornenia</h2>

      <div className="device-state">
        {support === 'ios-install' ? (
          <p>
            Na iPhone prídu upozornenia len z appky na ploche: v Safari ťukni na <b>Zdieľať</b> a potom <b>Pridať na plochu</b>.
            Otvor Rozvrh z plochy a zapni upozornenia tu.
          </p>
        ) : support === 'unsupported' ? (
          <p className="muted">Tento prehliadač nevie zobrazovať upozornenia. Skús Chrome, Edge alebo Safari.</p>
        ) : support === 'not-configured' ? (
          <p className="muted">Upozornenia ešte nie sú v appke nastavené.</p>
        ) : permission === 'denied' ? (
          <p>
            Upozornenia sú pre Rozvrh zablokované. Povoľ ich v nastaveniach{' '}
            {isIOS() ? 'iPhonu (Nastavenia → Upozornenia → Rozvrh)' : 'prehliadača pri adrese stránky'} a vráť sa sem.
          </p>
        ) : subscribed ? (
          <p className="device-on">
            <span className="dot-on" aria-hidden="true" />
            Toto zariadenie dostáva upozornenia, aj keď je appka zatvorená.
          </p>
        ) : (
          <p>Zapni upozornenia na každom zariadení, kde ich chceš dostávať (mobil aj počítač).</p>
        )}
        <div className="actions">
          {support === 'ok' && permission !== 'denied' && !subscribed && (
            <button className="btn btn-primary" onClick={turnOn} disabled={busy}>
              Zapnúť upozornenia na tomto zariadení
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => test()} disabled={busy || devices.length === 0}>
            Poslať testovaciu notifikáciu
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => test(45)}
            disabled={busy || devices.length === 0 || countdown !== null}
          >
            {countdown !== null ? `Príde o ${countdown} s, zavri appku` : 'Test o 45 s (so zavretou appkou)'}
          </button>
          {subscribed && (
            <button className="btn btn-danger-ghost" onClick={turnOff} disabled={busy}>
              Vypnúť na tomto zariadení
            </button>
          )}
        </div>
      </div>

      {devices.length > 0 && (
        <details className="more push-help">
          <summary>Okamžitý test príde, ale pri zavretej appke nič?</summary>
          <ul>
            <li>
              <b>Android:</b> Nastavenia telefónu → Aplikácie → Rozvrh (alebo Chrome) → Batéria → <i>Bez obmedzení</i>.
              Úsporný režim a optimalizácia batérie notifikácie na pozadí zadržia.
            </li>
            <li>
              Tamtiež skontroluj <i>Upozornenia</i>: musia byť povolené pre appku aj pre Chrome a nesmie byť zapnuté
              Nerušiť.
            </li>
            <li>
              <b>iPhone:</b> appka musí byť otvorená z plochy, nie zo Safari, a v Nastavenia → Upozornenia → Rozvrh povolená.
            </li>
            <li>Pripomienky prichádzajú len pre prijaté bloky práce, nie pre návrhy ceruzkou.</li>
          </ul>
        </details>
      )}

      {devices.length > 0 && (
        <>
          <h3>Zariadenia</h3>
          <ul className="devices">
            {devices.map((d) => (
              <li key={d.id}>
                <span>
                  <span>
                    <b>{d.device ?? 'Zariadenie'}</b>
                    {d.endpoint === endpoint && <span className="this-device"> (toto)</span>}
                  </span>
                  <span className="small muted">
                    {d.last_success_at
                      ? `naposledy doručené ${fmt(d.last_success_at, 'd. M. H:mm')}`
                      : `pridané ${fmt(d.created_at, 'd. M. yyyy')}`}
                  </span>
                </span>
                <button className="btn btn-danger-ghost" onClick={() => removeDevice(d)}>
                  Odobrať
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Čo ti má prísť</h3>
      <Switch
        checked={prefs.notify_events}
        onChange={(v) => set('notify_events', v)}
        title="Pripomienky udalostí"
        hint="Keď pri udalosti alebo spoji nastavíš upozornenie."
      />
      <Switch
        checked={prefs.notify_sessions}
        onChange={(v) => set('notify_sessions', v)}
        title="Začiatok bloku práce"
        hint="Len prijaté bloky, nie návrhy ceruzkou."
      >
        <select
          value={prefs.session_lead_minutes}
          onChange={(e) => set('session_lead_minutes', Number(e.target.value))}
          aria-label="Ako skoro pred blokom práce"
        >
          {SESSION_LEADS.map((m) => (
            <option key={m} value={m}>
              {m ? `${m} min vopred` : 'v čase začiatku'}
            </option>
          ))}
        </select>
      </Switch>
      <Switch
        checked={prefs.notify_deadlines}
        onChange={(v) => set('notify_deadlines', v)}
        title="Blížiaci sa termín úlohy"
      >
        <select
          value={prefs.deadline_lead_hours}
          onChange={(e) => set('deadline_lead_hours', Number(e.target.value))}
          aria-label="Ako skoro pred termínom"
        >
          {DEADLINE_LEADS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Switch>
      {profile.freelance_enabled && (
        <Switch
          checked={prefs.notify_gigs}
          onChange={(v) => set('notify_gigs', v)}
          title="Čas vyraziť na freelance akciu"
          hint="Podľa času na cestu a prípravu pri akcii."
        />
      )}
      <Switch
        checked={prefs.notify_summary}
        onChange={(v) => set('notify_summary', v)}
        title="Ranný prehľad dňa"
        hint="Koľko ťa dnes čaká udalostí, práce a termínov."
      >
        <input
          type="time"
          value={short(prefs.summary_time)}
          onChange={(e) => e.target.value && set('summary_time', e.target.value)}
          aria-label="Čas ranného prehľadu"
        />
      </Switch>
      <Switch
        checked={prefs.quiet_enabled}
        onChange={(v) => set('quiet_enabled', v)}
        title="Tichý režim v noci"
        hint="V tomto čase prídu len pripomienky udalostí a odchod na akcie."
      >
        <span className="time-range">
          <input
            type="time"
            value={short(prefs.quiet_from)}
            onChange={(e) => e.target.value && set('quiet_from', e.target.value)}
            aria-label="Tichý režim od"
          />
          <span>–</span>
          <input
            type="time"
            value={short(prefs.quiet_to)}
            onChange={(e) => e.target.value && set('quiet_to', e.target.value)}
            aria-label="Tichý režim do"
          />
        </span>
      </Switch>
    </section>
  );
}

function Switch({
  checked,
  onChange,
  title,
  hint,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`notif-row${checked ? '' : ' is-off'}`}>
      <label className="switch-row">
        <span>
          <b>{title}</b>
          {hint && <span className="small muted">{hint}</span>}
        </span>
        <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {children && checked && <div className="notif-extra">{children}</div>}
    </div>
  );
}
