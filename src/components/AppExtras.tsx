import { LANGS, chooseLang, setLang, t, useLang, type Lang } from '../lib/i18n';
import { APK_URL, android } from '../lib/android';

/** Slovenčina / Čeština / English. Signed in (with save), the choice goes to the profile as well. */
export function LanguagePicker({ save }: { save?: (lang: Lang) => void }) {
  const lang = useLang();
  return (
    <div className="segmented lang-picker" role="radiogroup" aria-label={t('Jazyk')}>
      {LANGS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={lang === l.value}
          lang={l.value}
          onClick={() => (save ? chooseLang(l.value, save) : setLang(l.value, { beforeSignIn: true }))}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/** Download link for the Android app (a release on GitHub). Inside the app it says which version runs. */
export function ApkDownload({ block = false }: { block?: boolean }) {
  const app = android();
  if (app) return <p className="small muted apk-version">{t('Používaš Android appku, verzia {v}.', { v: app.version() })}</p>;
  return (
    <a className={`btn btn-ghost apk-download${block ? ' btn-block' : ''}`} href={APK_URL} rel="noopener">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path
          d="M10 3v9M6 8.5l4 4 4-4M4 16h12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {t('Stiahnuť APK pre Android')}
    </a>
  );
}
