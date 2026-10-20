import { t } from './i18n';
import type { EventKind, Priority, RoutineKind, WeekParity } from './types';

export const ROUTINE_KINDS: Record<RoutineKind, { label: string; color: string }> = {
  class: { get label() { return t('Vyučovanie'); }, color: '#2B4BDB' },
  work: { get label() { return t('Práca, brigáda'); }, color: '#7A5AF8' },
  leisure: { get label() { return t('Voľný čas'); }, color: '#E8A317' },
  other: { get label() { return t('Iné, nemám čas'); }, color: '#5E6B85' },
};

export const PARITY_LABELS: Record<WeekParity, string> = {
  get all() { return t('Každý týždeň'); },
  get odd() { return t('Nepárny týždeň'); },
  get even() { return t('Párny týždeň'); },
};

export const DEFAULT_CLASS_PERIODS = [
  { start: '08:00', end: '08:45' },
  { start: '08:55', end: '09:40' },
  { start: '09:50', end: '10:35' },
  { start: '10:55', end: '11:40' },
  { start: '11:50', end: '12:35' },
  { start: '12:45', end: '13:30' },
  { start: '13:35', end: '14:20' },
  { start: '14:25', end: '15:10' },
];

export const EVENT_KINDS: Record<EventKind, { label: string; color: string }> = {
  event: { get label() { return t('Udalosť'); }, color: '#12A39A' },
  work: { get label() { return t('Práca na niečom'); }, color: '#7A5AF8' },
  commute: { get label() { return t('Cesta'); }, color: '#7C879C' },
  reminder: { get label() { return t('Pripomienka'); }, color: '#E2483D' },
  leisure: { get label() { return t('Voľný čas'); }, color: '#E8A317' },
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  get [1]() { return t('Nízka'); },
  get [2]() { return t('Stredná'); },
  get [3]() { return t('Vysoká'); },
  get [4]() { return t('Kritická'); },
};

export const DEFAULT_PRIORITY_COLORS = ['#8FB8A8', '#F2C14E', '#F08A4B', '#E2483D'];

export const LEISURE_COLOR = '#E8A317';

export const SWATCHES = [
  '#2B4BDB', '#4C8DF6', '#12A39A', '#3FAE5A', '#8FB8A8', '#E8A317',
  '#F2C14E', '#F08A4B', '#E2483D', '#E2489A', '#7A5AF8', '#7C879C',
];

export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, get label() { return t('Bez upozornenia'); } },
  { value: 0, get label() { return t('V čase začiatku'); } },
  { value: 5, get label() { return t('5 min vopred'); } },
  { value: 10, get label() { return t('10 min vopred'); } },
  { value: 15, get label() { return t('15 min vopred'); } },
  { value: 30, get label() { return t('30 min vopred'); } },
  { value: 60, get label() { return t('1 hodinu vopred'); } },
  { value: 1440, get label() { return t('1 deň vopred'); } },
];

export function priorityColor(colors: string[] | undefined, p: Priority) {
  return (colors && colors[p - 1]) || DEFAULT_PRIORITY_COLORS[p - 1];
}

/** Readable text color (ink or white) on top of a solid background. */
export function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1B2340' : '#FFFFFF';
}
