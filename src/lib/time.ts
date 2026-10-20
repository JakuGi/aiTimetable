import { addDays, format, getISODay, startOfDay, startOfWeek } from 'date-fns';
import { cs, enGB, sk } from 'date-fns/locale';
import { getLang, t } from './i18n';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** "HH:MM" or "HH:MM:SS" -> minutes after midnight */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Date at the given minutes-after-midnight on the same local day as `day`. */
export function atMinutes(day: Date, minutes: number): Date {
  const d = startOfDay(day);
  d.setMinutes(minutes);
  return d;
}

export function weekStart(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

export function weekDays(start: Date, count = 7): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export const isoWeekday = getISODay;

const WEEKDAY_SHORT = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const WEEKDAY_LONG = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];

/** Monday = 0 */
export const weekdayShort = (i: number) => t(WEEKDAY_SHORT[i]);
export const weekdayLong = (i: number) => t(WEEKDAY_LONG[i]);
export const weekdaysShort = () => WEEKDAY_SHORT.map((d) => t(d));

const LOCALES = { sk, cs, en: enGB };

/** Patterns are written the Slovak way ("d. M."); English writes dates as "20/10". */
function localPattern(pattern: string) {
  if (getLang() !== 'en') return pattern;
  return pattern
    .replace('d. M. yyyy', 'd/M/yyyy')
    .replace('d. M.', 'd/M')
    .replace('d. MMMM', 'd MMMM')
    .replace(/^d\.$/, 'd');
}

export function fmt(d: Date | string, pattern: string): string {
  return format(typeof d === 'string' ? new Date(d) : d, localPattern(pattern), { locale: LOCALES[getLang()] });
}

export function fmtTime(d: Date | string): string {
  return fmt(d, 'H:mm');
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Value for <input type="datetime-local"> in local time */
export function toLocalInput(d: Date | string | null): string {
  if (!d) return '';
  return format(typeof d === 'string' ? new Date(d) : d, "yyyy-MM-dd'T'HH:mm");
}

export function toDateInput(d: Date | string | null): string {
  if (!d) return '';
  return format(typeof d === 'string' ? new Date(d) : d, 'yyyy-MM-dd');
}

export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

/** "o 3 dni", "zajtra", "pred 2 hodinami"... short and human */
export function relativeDeadline(deadline: string, now = new Date()): string {
  const d = new Date(deadline);
  const diffDays = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY);
  if (d.getTime() < now.getTime()) {
    if (diffDays === 0) return t('dnes, už po termíne');
    return diffDays === -1 ? t('včera, po termíne') : t('po termíne {n} d', { n: -diffDays });
  }
  if (diffDays === 0) return t('dnes o {time}', { time: fmtTime(d) });
  if (diffDays === 1) return t('zajtra o {time}', { time: fmtTime(d) });
  if (diffDays < 7) return t('{day} o {time}', { day: fmt(d, 'EEEE'), time: fmtTime(d) });
  return t('o {n} dní, {date}', { n: diffDays, date: fmt(d, 'd. M.') });
}

/**
 * Odd or even week, counted from a Monday the user marked as odd.
 * Counting from an anchor (not ISO week numbers) keeps the alternation intact across new year.
 */
export function weekParity(day: Date, oddAnchor: string): 'odd' | 'even' {
  const anchor = weekStart(parseInput(oddAnchor));
  const weeks = Math.round((weekStart(day).getTime() - anchor.getTime()) / (7 * DAY));
  return ((weeks % 2) + 2) % 2 === 0 ? 'odd' : 'even';
}

/** Parses <input type="date"> or "datetime-local" values as local time. */
export function parseInput(v: string): Date {
  return new Date(v.length === 10 ? `${v}T00:00` : v);
}
