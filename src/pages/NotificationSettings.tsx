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
import { plural, t } from '../lib/i18n';
import { android } from '../lib/android';

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
  { value: 2, get label() { return t('2 h vopred'); } },
  { value: 6, get label() { return t('6 h vopred'); } },
  { value: 24, get label() { return t('deň vopred'); } },
  { value: 48, get label() { return t('2 dni vopred'); } },
];
const short = (time: string) => time.slice(0, 5);

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
  // the Android app shows reminders by itself; it only needs the permission
  const app = android();
  const [appCanNotify, setAppCanNotify] = useState(() => app?.canNotify() ?? false);

  useEffect(() => {
    if (!app) return;
    const check = () => setAppCanNotify(app.canNotify());
    window.addEventListener('rozvrh-notifications', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('rozvrh-notifications', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [app]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) return setCountdown(null);
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
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
    if (r.ok) notify(t('Upozornenia na tomto zariadení sú zapnuté.'), 'success');
    else if (r.reason === 'denied') notify(t('Upozornenia sú zablokované. Povoľ ich v nastaveniach prehliadača alebo telefónu.'), 'error');
    else if (r.reason === 'error') notify(t('Nepodarilo sa zapnúť upozornenia: {error}', { error: r.message ?? '' }), 'error');
    refresh();
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    notify(t('Toto zariadenie už upozornenia nedostane.'), 'info');
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
    if ('error' in r) return notify(t('Test zlyhal: {error}', { error: r.error }), 'error');
    if (r.devices === 0) return notify(t('Žiadne zariadenie nemá zapnuté upozornenia. Najprv ich zapni.'), 'info');
    if ('scheduled' in r) {
      setCountdown(r.delaySeconds);
      return notify(
        t('Notifikácia príde o {n} s. Teraz appku úplne zavri (aj zo zoznamu otvorených aplikácií) a počkaj.', { n: r.delaySeconds }),
        'success',
      );
    }
    notify(
      r.failed
        ? t('Odoslané na {sent} z {n} zariadení. Ostatné sa nepodarilo zastihnúť.', { sent: r.sent, n: r.devices })
        : t('Odoslané na {n} {devices}. Malo by prísť o pár sekúnd.', {
            n: r.sent,
            devices: plural(r.sent, 'zariadenie', 'zariadenia', 'zariadení'),
          }),
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
      <h2>{t('Upozornenia')}</h2>

      {app && (
        <div className="device-state">
          {appCanNotify ? (
            <p className="device-on">
              <span className="dot-on" aria-hidden="true" />
              {t('Android appka ti pripomienky ukáže sama, aj keď je zatvorená: udalosti, spoje, bloky práce a odchod na akcie.')}
            </p>
          ) : (
            <p>{t('Povoľ appke upozornenia a pripomienky ti prídu, aj keď je zatvorená.')}</p>
          )}
          {!appCanNotify && (
            <div className="actions">
              <button className="btn btn-primary" onClick={() => app.requestNotifications()}>
                {t('Povoliť upozornenia')}
              </button>
            </div>
          )}
          <p className="small muted">
            {t('Ranný prehľad a blížiace sa termíny chodia ako webové upozornenia, zapneš ich v Rozvrhu otvorenom v prehliadači.')}
          </p>
        </div>
      )}

      <div className="device-state" hidden={Boolean(app)}>
        {support === 'ios-install' ? (
          <p>
            {t('Na iPhone prídu upozornenia len z appky na ploche: v Safari ťukni na')} <b>{t('Zdieľať')}</b> {t('a potom')}{' '}
            <b>{t('Pridať na plochu')}</b>. {t('Otvor Rozvrh z plochy a zapni upozornenia tu.')}
          </p>
        ) : support === 'unsupported' ? (
          <p className="muted">{t('Tento prehliadač nevie zobrazovať upozornenia. Skús Chrome, Edge alebo Safari.')}</p>
        ) : support === 'not-configured' ? (
          <p className="muted">{t('Upozornenia ešte nie sú v appke nastavené.')}</p>
        ) : permission === 'denied' ? (
          <p>
            {isIOS()
              ? t('Upozornenia sú pre Rozvrh zablokované. Povoľ ich v nastaveniach iPhonu (Nastavenia → Upozornenia → Rozvrh) a vráť sa sem.')
              : t('Upozornenia sú pre Rozvrh zablokované. Povoľ ich v nastaveniach prehliadača pri adrese stránky a vráť sa sem.')}
          </p>
        ) : subscribed ? (
          <p className="device-on">
            <span className="dot-on" aria-hidden="true" />
            {t('Toto zariadenie dostáva upozornenia, aj keď je appka zatvorená.')}
          </p>
        ) : (
          <p>{t('Zapni upozornenia na každom zariadení, kde ich chceš dostávať (mobil aj počítač).')}</p>
        )}
        <div className="actions">
          {support === 'ok' && permission !== 'denied' && !subscribed && (
            <button className="btn btn-primary" onClick={turnOn} disabled={busy}>
              {t('Zapnúť upozornenia na tomto zariadení')}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => test()} disabled={busy || devices.length === 0}>
            {t('Poslať testovaciu notifikáciu')}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => test(45)}
            disabled={busy || devices.length === 0 || countdown !== null}
          >
            {countdown !== null ? t('Príde o {n} s, zavri appku', { n: countdown }) : t('Test o 45 s (so zavretou appkou)')}
          </button>
          {subscribed && (
            <button className="btn btn-danger-ghost" onClick={turnOff} disabled={busy}>
              {t('Vypnúť na tomto zariadení')}
            </button>
          )}
        </div>
      </div>

      {devices.length > 0 && (
        <details className="more push-help">
          <summary>{t('Okamžitý test príde, ale pri zavretej appke nič?')}</summary>
          <ul>
            <li>
              <b>{t('Android:')}</b> {t('Nastavenia telefónu → Aplikácie → Rozvrh (alebo Chrome) → Batéria →')}{' '}
              <i>{t('Bez obmedzení')}</i>. {t('Úsporný režim a optimalizácia batérie notifikácie na pozadí zadržia.')}
            </li>
            <li>
              {t('Tamtiež skontroluj')} <i>{t('Upozornenia')}</i>
              {t(': musia byť povolené pre appku aj pre Chrome a nesmie byť zapnuté Nerušiť.')}
            </li>
            <li>
              <b>{t('iPhone:')}</b>{' '}
              {t('appka musí byť otvorená z plochy, nie zo Safari, a v Nastavenia → Upozornenia → Rozvrh povolená.')}
            </li>
            <li>{t('Pripomienky prichádzajú len pre prijaté bloky práce, nie pre návrhy ceruzkou.')}</li>
          </ul>
        </details>
      )}

      {devices.length > 0 && (
        <>
          <h3>{t('Zariadenia')}</h3>
          <ul className="devices">
            {devices.map((d) => (
              <li key={d.id}>
                <span>
                  <span>
                    <b>{d.device ?? t('Zariadenie')}</b>
                    {d.endpoint === endpoint && <span className="this-device"> {t('(toto)')}</span>}
                  </span>
                  <span className="small muted">
                    {d.last_success_at
                      ? t('naposledy doručené {date}', { date: fmt(d.last_success_at, 'd. M. H:mm') })
                      : t('pridané {date}', { date: fmt(d.created_at, 'd. M. yyyy') })}
                  </span>
                </span>
                <button className="btn btn-danger-ghost" onClick={() => removeDevice(d)}>
                  {t('Odobrať')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>{t('Čo ti má prísť')}</h3>
      <Switch
        checked={prefs.notify_events}
        onChange={(v) => set('notify_events', v)}
        title={t('Pripomienky udalostí')}
        hint={t('Keď pri udalosti alebo spoji nastavíš upozornenie.')}
      />
      <Switch
        checked={prefs.notify_sessions}
        onChange={(v) => set('notify_sessions', v)}
        title={t('Začiatok bloku práce')}
        hint={t('Len prijaté bloky, nie návrhy ceruzkou.')}
      >
        <select
          value={prefs.session_lead_minutes}
          onChange={(e) => set('session_lead_minutes', Number(e.target.value))}
          aria-label={t('Ako skoro pred blokom práce')}
        >
          {SESSION_LEADS.map((m) => (
            <option key={m} value={m}>
              {m ? t("{n} min vopred", { n: m }) : t("v čase začiatku")}
            </option>
          ))}
        </select>
      </Switch>
      <Switch
        checked={prefs.notify_deadlines}
        onChange={(v) => set('notify_deadlines', v)}
        title={t('Blížiaci sa termín úlohy')}
      >
        <select
          value={prefs.deadline_lead_hours}
          onChange={(e) => set('deadline_lead_hours', Number(e.target.value))}
          aria-label={t('Ako skoro pred termínom')}
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
          title={t('Čas vyraziť na freelance akciu')}
          hint={t('Podľa času na cestu a prípravu pri akcii.')}
        />
      )}
      <Switch
        checked={prefs.notify_summary}
        onChange={(v) => set('notify_summary', v)}
        title={t('Ranný prehľad dňa')}
        hint={t('Koľko ťa dnes čaká udalostí, práce a termínov.')}
      >
        <input
          type="time"
          value={short(prefs.summary_time)}
          onChange={(e) => e.target.value && set('summary_time', e.target.value)}
          aria-label={t('Čas ranného prehľadu')}
        />
      </Switch>
      <Switch
        checked={prefs.quiet_enabled}
        onChange={(v) => set('quiet_enabled', v)}
        title={t('Tichý režim v noci')}
        hint={t('V tomto čase prídu len pripomienky udalostí a odchod na akcie.')}
      >
        <span className="time-range">
          <input
            type="time"
            value={short(prefs.quiet_from)}
            onChange={(e) => e.target.value && set('quiet_from', e.target.value)}
            aria-label={t('Tichý režim od')}
          />
          <span>–</span>
          <input
            type="time"
            value={short(prefs.quiet_to)}
            onChange={(e) => e.target.value && set('quiet_to', e.target.value)}
            aria-label={t('Tichý režim do')}
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
