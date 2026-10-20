import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { appUrl, supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { Brand } from '../components/Brand';
import { ApkDownload, LanguagePicker } from '../components/AppExtras';
import { t } from '../lib/i18n';

function AuthShell({ title, children, foot }: { title: string; children: ReactNode; foot?: ReactNode }) {
  const { linkError, clearLinkError } = useAuth();
  return (
    <div className="auth">
      <div className="auth-paper" aria-hidden="true">
        <div className="auth-sample">
          <span className="s s1">{t('Matematika')}</span>
          <span className="s s2">{t('Bus 23')}</span>
          <span className="s s3">{t('Referát')}</span>
          <span className="s s4">{t('Hry')}</span>
          <span className="s-now" />
        </div>
      </div>
      <main className="auth-card">
        <Brand />
        <h1>{title}</h1>
        {linkError && (
          <p className="form-error" role="alert">
            {linkError}{' '}
            <button className="link-btn" onClick={clearLinkError}>
              {t('Skryť')}
            </button>
          </p>
        )}
        {children}
        {foot && <div className="auth-foot">{foot}</div>}
        <div className="auth-extras">
          <LanguagePicker />
          <ApkDownload block />
        </div>
      </main>
    </div>
  );
}

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return t('Nesprávny e-mail alebo heslo.');
  if (m.includes('email not confirmed')) return t('E-mail ešte nie je overený. Klikni na odkaz, ktorý sme ti poslali.');
  if (m.includes('already registered')) return t('Účet s týmto e-mailom už existuje. Prihlás sa.');
  if (m.includes('password should be at least')) return t('Heslo musí mať aspoň 8 znakov.');
  if (m.includes('rate limit') || m.includes('security purposes'))
    return t('Príliš veľa pokusov za krátky čas. Skús to o chvíľu znova.');
  if (m.includes('unable to validate email') || m.includes('invalid format')) return t('Toto nevyzerá ako platný e-mail.');
  return message;
}

export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (session) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setUnconfirmed(error.message.toLowerCase().includes('not confirmed'));
      setError(translate(error.message));
    } else navigate('/', { replace: true });
  };

  return (
    <AuthShell
      title={t('Prihlásenie')}
      foot={
        <>
          {t('Nemáš účet?')} <Link to="/register">{t('Zaregistruj sa')}</Link>
        </>
      }
    >
      <form onSubmit={submit} className="auth-form">
        <label className="field">
          <span className="field-label">{t('E-mail')}</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('Heslo')}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {unconfirmed && <ResendButton email={email.trim()} />}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t('Prihlasujem…') : t('Prihlásiť sa')}
        </button>
        <Link to="/forgot-password" className="small">
          {t('Zabudnuté heslo')}
        </Link>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (session) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t('Heslo musí mať aspoň 8 znakov.'));
    if (password !== password2) return setError(t('Heslá sa nezhodujú.'));
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: appUrl('/') },
    });
    setBusy(false);
    if (error) return setError(translate(error.message));
    // Supabase returns a user with no identities when the e-mail is already registered
    if (data.user && data.user.identities?.length === 0) return setError(t('Účet s týmto e-mailom už existuje. Prihlás sa.'));
    if (data.session) navigate('/', { replace: true });
    else navigate('/check-email', { state: { email: email.trim() } });
  };

  return (
    <AuthShell
      title={t('Nový účet')}
      foot={
        <>
          {t('Už máš účet?')} <Link to="/login">{t('Prihlás sa')}</Link>
        </>
      }
    >
      <form onSubmit={submit} className="auth-form">
        <label className="field">
          <span className="field-label">{t('Meno')}</span>
          <input autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="field">
          <span className="field-label">{t('E-mail')}</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('Heslo')}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="field-hint">{t('Aspoň 8 znakov.')}</span>
        </label>
        <label className="field">
          <span className="field-label">{t('Heslo znova')}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t('Vytváram účet…') : t('Vytvoriť účet')}
        </button>
      </form>
    </AuthShell>
  );
}

export function CheckEmailPage() {
  const email = (useLocation().state as { email?: string } | null)?.email ?? '';
  return (
    <AuthShell
      title={t('Over svoj e-mail')}
      foot={
        <>
          {t('Overené?')} <Link to="/login">{t('Prihlás sa')}</Link>
        </>
      }
    >
      <p>
        {t('Poslali sme odkaz na')} <b>{email || t('tvoj e-mail')}</b>.{' '}
        {t('Klikni naň a účet sa aktivuje. Odkaz môžeš otvoriť aj na inom zariadení.')}
      </p>
      <p className="small muted">{t('Nič neprišlo? Pozri spam alebo si odkaz pošli znova.')}</p>
      {email && <ResendButton email={email} />}
    </AuthShell>
  );
}

function ResendButton({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const resend = async () => {
    setState('sending');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl('/') } });
    setState(error ? translate(error.message) : 'sent');
  };
  return (
    <div className="resend">
      <button type="button" className="btn btn-ghost" onClick={resend} disabled={state === 'sending' || state === 'sent'}>
        {state === 'sent' ? t('Odkaz odoslaný') : t('Poslať overovací odkaz znova')}
      </button>
      {state !== 'idle' && state !== 'sending' && state !== 'sent' && <p className="form-error">{state}</p>}
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset-password') });
    setBusy(false);
    if (error) setError(translate(error.message));
    else setSent(true);
  };

  return (
    <AuthShell
      title={t('Zabudnuté heslo')}
      foot={
        <>
          {t('Spomenul si si?')} <Link to="/login">{t('Prihlás sa')}</Link>
        </>
      }
    >
      {sent ? (
        <p>{t('Ak účet s e-mailom {email} existuje, prišiel ti odkaz na nastavenie nového hesla.', { email })}</p>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span className="field-label">{t('E-mail')}</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {t('Poslať odkaz')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { session, finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t('Heslo musí mať aspoň 8 znakov.'));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(translate(error.message));
    finishRecovery();
    navigate('/', { replace: true });
  };

  return (
    <AuthShell title={t('Nové heslo')}>
      {!session ? (
        <p>
          {t('Odkaz je neplatný alebo vypršal.')} <Link to="/forgot-password">{t('Pošli si nový')}</Link>.
        </p>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span className="field-label">{t('Nové heslo')}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {t('Uložiť heslo')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
