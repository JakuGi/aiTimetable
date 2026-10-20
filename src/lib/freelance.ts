import type { Gig, GigMode, GigStatus, Session } from './types';
import { MINUTE } from './time';
import { getLang, t } from './i18n';

export const FREELANCE_CATEGORY = 'Freelance';
export const FREELANCE_COLOR = '#2F9E44';

export const GIG_MODES: Record<GigMode, { label: string; hint: string }> = {
  event: {
    get label() { return t('Akcia'); },
    get hint() { return t('Na mieste v daný čas: nakladanie, sťahovanie, práca na akcii.'); },
  },
  project: {
    get label() { return t('Projekt'); },
    get hint() { return t('Práca na úlohe do termínu: programovanie, grafika, texty.'); },
  },
};

export const GIG_STATUS: Record<GigStatus, string> = {
  get planned() { return t('Dohodnuté'); },
  get confirmed() { return t('Potvrdené'); },
  get done() { return t('Hotové, čaká na platbu'); },
  get paid() { return t('Zaplatené'); },
  get cancelled() { return t('Zrušené'); },
};

const EXPENSES = ['Doprava', 'Parkovanie', 'Jedlo', 'Materiál', 'Náradie', 'Ubytovanie'];
export const expensePresets = () => EXPENSES.map((e) => t(e));

const MONEY_LOCALE = { sk: 'sk-SK', cs: 'cs-CZ', en: 'en-IE' } as const;
export const fmtMoney = (n: number) =>
  new Intl.NumberFormat(MONEY_LOCALE[getLang()], { style: 'currency', currency: 'EUR' }).format(Number.isFinite(n) ? n : 0);

export const num = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Hours used for hourly pay: entered hours, else tracked work, else the plan. */
export function gigHours(g: Gig, sessions: Session[]): { hours: number; source: 'entered' | 'tracked' | 'planned' } {
  if (g.hours !== null && g.hours !== '') return { hours: num(g.hours), source: 'entered' };
  if (g.mode === 'event' && g.starts_at && g.ends_at) {
    return { hours: (new Date(g.ends_at).getTime() - new Date(g.starts_at).getTime()) / (60 * MINUTE), source: 'planned' };
  }
  const tracked = sessions
    .filter((s) => g.task_id && s.task_id === g.task_id && s.status === 'done')
    .reduce((sum, s) => sum + (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / MINUTE, 0);
  if (tracked > 0) return { hours: tracked / 60, source: 'tracked' };
  return { hours: (g.estimated_minutes ?? 0) / 60, source: 'planned' };
}

export function gigEarnings(g: Gig, sessions: Session[]) {
  if (g.status === 'cancelled') return 0;
  return g.pay_type === 'fixed' ? num(g.pay_amount) : num(g.pay_amount) * gigHours(g, sessions).hours;
}

export const gigExpenses = (g: Gig) => (g.expenses ?? []).reduce((s, e) => s + num(e.amount), 0);

export const gigNet = (g: Gig, sessions: Session[]) => gigEarnings(g, sessions) - gigExpenses(g);

/** The moment that matters for sorting and month totals: event start or project deadline. */
export const gigDate = (g: Gig) => g.starts_at ?? g.deadline ?? g.created_at;

/** Time an event gig takes from the calendar: travel + preparation before, travel after. */
export function gigBusy(g: Gig): { start: number; end: number } | null {
  if (g.mode !== 'event' || g.status === 'cancelled' || !g.starts_at || !g.ends_at) return null;
  const before = (g.prep_minutes + g.travel_minutes) * MINUTE;
  return {
    start: new Date(g.starts_at).getTime() - before,
    end: new Date(g.ends_at).getTime() + g.travel_minutes * MINUTE,
  };
}

export const newExpenseId = () => Math.random().toString(36).slice(2, 10);
