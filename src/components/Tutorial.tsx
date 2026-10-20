import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useData } from '../lib/data';
import { t } from '../lib/i18n';

interface Step {
  title: string;
  text: string;
  /** what to point at; none = a card in the middle */
  target?: string;
  /** the page the step lives on */
  route?: string;
  /** the user clicks the highlighted thing to go on (a tab: it also opens it) */
  click?: { goes: string };
}

const STEPS: Step[] = [
  {
    get title() { return t('Vitaj v Rozvrhu'); },
    get text() { return t('Za minútku ti ukážem, ako appka funguje. Kedykoľvek ho spustíš znova v Nastaveniach.'); },
  },
  {
    route: '/',
    target: '.nav-link[href="/routine"]',
    click: { goes: '/routine' },
    get title() { return t('Najprv rozvrh'); },
    get text() { return t('Klikni na Rozvrh. Zapíšeš si doň, čo sa opakuje každý týždeň: školu, tréningy, brigádu.'); },
  },
  {
    route: '/routine',
    target: '[data-tour="class-grid"]',
    get title() { return t('Rozvrh hodín ako tabuľka'); },
    get text() { return t('Hodiny vyplníš ako tabuľku v škole, časy podľa zvonenia sa doplnia samé.'); },
  },
  {
    route: '/routine',
    target: '.nav-link[href="/tasks"]',
    click: { goes: '/tasks' },
    get title() { return t('Úlohy'); },
    get text() { return t('Klikni na Úlohy. Sem píšeš, čo treba stihnúť: odhad času, termín a dôležitosť.'); },
  },
  {
    route: '/tasks',
    target: '.nav-link[href="/"]',
    click: { goes: '/' },
    get title() { return t('Môj týždeň'); },
    get text() { return t('Klikni na Môj týždeň. Tu je celý tvoj týždeň: rozvrh, udalosti, spoje aj práca na úlohách.'); },
  },
  {
    route: '/',
    target: '[data-tour="add"]',
    get title() { return t('Pridať'); },
    get text() { return t('Jedným plusom pridáš úlohu, udalosť alebo pripomienku. Prepínač je hore v okne.'); },
  },
  {
    route: '/',
    target: '[data-tour="free"]',
    get title() { return t('Vyhradiť voľno'); },
    get text() { return t('Voľný čas si nakreslíš priamo do dní. Plánovač doň prácu nedá.'); },
  },
  {
    route: '/',
    target: '[data-tour="plan"]',
    get title() { return t('Navrhnúť plán'); },
    get text() {
      return t('Plánovač nájde v týždni voľné chvíle a rozloží do nich úlohy. Návrh je ceruzkou: prijmeš ho, posunieš alebo zahodíš.');
    },
  },
  {
    route: '/',
    target: '.now-card',
    get title() { return t('Teraz a potom'); },
    get text() { return t('Hneď vidíš, čo práve prebieha a čo ťa čaká. Po bloku práce sa appka opýta, ako to išlo.'); },
  },
  {
    route: '/',
    target: '.nav-link[href="/settings"]',
    get title() { return t('Nastavenia'); },
    get text() { return t('Tu zmeníš jazyk, voľno medzi prácou, upozornenia a stiahneš si Android appku.'); },
  },
  {
    get title() { return t('Hotovo'); },
    get text() { return t('Začni rozvrhom a prvou úlohou. Veľa šťastia!'); },
  },
];

const START = 'rozvrh-tutorial';
const doneKey = (userId: string) => `rozvrh.tutorial.${userId}`;

/** Opens the tutorial from anywhere (Settings). */
export function startTutorial() {
  window.dispatchEvent(new Event(START));
}

function seen(userId: string) {
  try {
    return localStorage.getItem(doneKey(userId)) === '1';
  } catch {
    return true;
  }
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * A short guided tour over the real screens: a spotlight on one thing at a time, tabs are
 * clicked for real. Starts once after sign-up (when the gender question is answered).
 */
export function Tutorial() {
  const { user } = useAuth();
  const { profile } = useData();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const s = step === null ? null : STEPS[step];

  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(START, open);
    return () => window.removeEventListener(START, open);
  }, []);

  // the first time: once the app knows how to address the user
  useEffect(() => {
    if (user && profile?.gender && !seen(user.id)) setStep((v) => v ?? 0);
  }, [user, profile?.gender]);

  const finish = useCallback(() => {
    if (user) {
      try {
        localStorage.setItem(doneKey(user.id), '1');
      } catch {
        /* private mode */
      }
    }
    setStep(null);
  }, [user]);

  const next = useCallback(() => setStep((v) => (v === null || v >= STEPS.length - 1 ? null : v + 1)), []);
  const back = () => setStep((v) => (v ? v - 1 : v));

  // go to the step's page
  useEffect(() => {
    if (s?.route && pathname !== s.route) navigate(s.route);
  }, [s, pathname, navigate]);

  // a tab click moves on
  useEffect(() => {
    if (s?.click && pathname === s.click.goes) next();
  }, [s, pathname, next]);

  // follow the target (layout changes, scrolling, rotating the phone)
  useLayoutEffect(() => {
    if (!s?.target) return setBox(null);
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(s.target!);
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox((b) =>
        b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height
          ? b
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      raf = requestAnimationFrame(measure);
    };
    document.querySelector(s.target)?.scrollIntoView({ block: 'nearest' });
    measure();
    return () => cancelAnimationFrame(raf);
  }, [s, pathname]);

  useEffect(() => {
    if (step === null) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && finish();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [step, finish]);

  if (!s || step === null) return null;
  const last = step === STEPS.length - 1;
  const pad = 6;
  const hole = box && { top: box.top - pad, left: box.left - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };

  // the card goes below the target, or above it when there is no room (the bottom bar on a phone)
  const vh = window.innerHeight;
  const cardStyle: CSSProperties = hole
    ? hole.top + hole.height + 220 < vh
      ? { top: hole.top + hole.height + 12, left: clamp(hole.left, 12, window.innerWidth - 332) }
      : { bottom: vh - hole.top + 12, left: clamp(hole.left, 12, window.innerWidth - 332) }
    : {};

  // blockers around the hole; the hole itself lets clicks through only when the step wants a click
  const blockers: CSSProperties[] = hole
    ? [
        { top: 0, left: 0, right: 0, height: Math.max(0, hole.top) },
        { top: hole.top + hole.height, left: 0, right: 0, bottom: 0 },
        { top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height },
        { top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height },
        ...(s.click ? [] : [{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }]),
      ]
    : [{ inset: 0 }];

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('Návod')}>
      {blockers.map((b, i) => (
        <div key={i} className="tour-block" style={b} />
      ))}
      {hole ? <div className={`tour-hole${s.click ? ' is-click' : ''}`} style={hole} /> : <div className="tour-dim" />}
      <section className={`tour-card${hole ? '' : ' is-center'}`} style={cardStyle}>
        <span className="tour-count">
          {step + 1} / {STEPS.length}
        </span>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="link-btn" onClick={finish}>
              {t('Preskočiť')}
            </button>
          )}
          <span className="spacer" />
          {step > 0 && !last && (
            <button type="button" className="btn btn-ghost btn-small" onClick={back}>
              {t('Späť')}
            </button>
          )}
          {s.click && box ? (
            <span className="tour-hint">{t('Klikni na zvýraznené')}</span>
          ) : (
            <button type="button" className="btn btn-primary btn-small" onClick={last ? finish : next} autoFocus>
              {step === 0 ? t('Začať') : last ? t('Hotovo') : t('Ďalej')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
