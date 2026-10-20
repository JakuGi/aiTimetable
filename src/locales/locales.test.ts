import { describe, expect, it } from 'vitest';
import cs from './cs';
import en from './en';

// every source file as text (tests and the dictionaries themselves left out)
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.ts', '!../locales/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const source = (path: string) => SOURCES[`../${path}`];
const STR = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;

const literals = (args: string) => [...args.matchAll(new RegExp(STR, 'g'))].map((m) => (m[1] ?? m[2]).replace(/\\(.)/g, '$1'));

/** Every Slovak text the app looks up: t('…'), g('…', '…'), plural(n, '…', '…', '…') and the label tables. */
function keys(): Set<string> {
  const out = new Set<string>();
  for (const src of Object.values(SOURCES)) {
    for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*(?:${STR})`, 'g'))) out.add((m[1] ?? m[2]).replace(/\\(.)/g, '$1'));
    for (const m of src.matchAll(new RegExp(String.raw`\bg\(\s*((?:${STR})\s*,\s*(?:${STR}))`, 'g'))) literals(m[1]).forEach((k) => out.add(k));
    for (const m of src.matchAll(new RegExp(String.raw`\bplural\([^,]+,\s*((?:${STR})\s*,\s*(?:${STR})\s*,\s*(?:${STR}))`, 'g')))
      literals(m[1]).forEach((k) => out.add(k));
  }
  // texts kept in tables and translated where shown
  const table = (path: string, pattern: RegExp) => {
    for (const m of source(path).matchAll(pattern)) out.add(m[1]);
  };
  table('components/Layout.tsx', /(?:label|short): '([^']+)'/g);
  table('lib/now.ts', /^\s+\w+: '(Práve[^']*)',$/gm);
  table('lib/now.ts', /g\(gender, '([^']+)'/g);
  table('lib/now.ts', /g\(gender, '[^']+', '([^']+)'/g);
  for (const list of [/WEEKDAY_SHORT = \[([^\]]+)\]/, /WEEKDAY_LONG = \[([^\]]+)\]/]) {
    literals(source('lib/time.ts').match(list)![1]).forEach((k) => out.add(k));
  }
  literals(source('lib/freelance.ts').match(/EXPENSES = \[([^\]]+)\]/)![1]).forEach((k) => out.add(k));
  return out;
}

describe('translations', () => {
  const all = [...keys()];

  it('finds the texts', () => {
    expect(all.length).toBeGreaterThan(500);
  });

  it.each([
    ['cs', cs],
    ['en', en],
  ])('%s has every text', (_, dict) => {
    expect(all.filter((k) => !(k in dict))).toEqual([]);
  });

  it.each([
    ['cs', cs],
    ['en', en],
  ])('%s keeps the {placeholders}', (_, dict) => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(all.filter((k) => k in dict && names(k).join() !== names(dict[k]).join())).toEqual([]);
  });
});
