import type { EventKind, Priority, RoutineKind } from './types';

export const ROUTINE_KINDS: Record<RoutineKind, { label: string; color: string }> = {
  class: { label: 'Vyučovanie', color: '#2B4BDB' },
  work: { label: 'Práca, brigáda', color: '#7A5AF8' },
  commute: { label: 'Cesta (bus, vlak)', color: '#7C879C' },
  leisure: { label: 'Voľný čas', color: '#E8A317' },
  other: { label: 'Iné, som zaneprázdnený', color: '#5E6B85' },
};

export const EVENT_KINDS: Record<EventKind, { label: string; color: string }> = {
  event: { label: 'Udalosť', color: '#12A39A' },
  work: { label: 'Práca na niečom', color: '#7A5AF8' },
  commute: { label: 'Cesta', color: '#7C879C' },
  reminder: { label: 'Pripomienka', color: '#E2483D' },
  leisure: { label: 'Voľný čas', color: '#E8A317' },
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Nízka',
  2: 'Stredná',
  3: 'Vysoká',
  4: 'Kritická',
};

export const DEFAULT_PRIORITY_COLORS = ['#8FB8A8', '#F2C14E', '#F08A4B', '#E2483D'];

export const LEISURE_COLOR = '#E8A317';

export const SWATCHES = [
  '#2B4BDB', '#4C8DF6', '#12A39A', '#3FAE5A', '#8FB8A8', '#E8A317',
  '#F2C14E', '#F08A4B', '#E2483D', '#E2489A', '#7A5AF8', '#7C879C',
];

export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Bez upozornenia' },
  { value: 0, label: 'V čase začiatku' },
  { value: 5, label: '5 min vopred' },
  { value: 10, label: '10 min vopred' },
  { value: 15, label: '15 min vopred' },
  { value: 30, label: '30 min vopred' },
  { value: 60, label: '1 hodinu vopred' },
  { value: 1440, label: '1 deň vopred' },
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
