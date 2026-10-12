import { useMemo, useState, type KeyboardEvent } from 'react';
import { Modal } from '../components/Modal';
import { useData } from '../lib/data';
import { DEFAULT_CLASS_PERIODS, PARITY_LABELS } from '../lib/meta';
import { WEEKDAY_SHORT } from '../lib/time';
import type { ClassPeriod, RoutineBlock, WeekParity } from '../lib/types';
import { Segmented } from './fields';

const DAYS = [1, 2, 3, 4, 5];
const key = (day: number, period: number) => `${day}:${period}`;
const short = (t: string) => t.slice(0, 5);

interface Placed {
  block: RoutineBlock;
  from: number; // first period index
  to: number; // last period index (double periods span more)
}

/** Class blocks that line up with the bell schedule, so they can be shown as grid cells. */
function placeBlocks(blocks: RoutineBlock[], periods: ClassPeriod[], parity: WeekParity): Placed[] {
  const out: Placed[] = [];
  for (const b of blocks) {
    if (b.kind !== 'class' || b.week_parity !== parity) continue;
    const from = periods.findIndex((p) => p.start === short(b.start_time));
    const to = periods.findIndex((p) => p.end === short(b.end_time));
    if (from !== -1 && to >= from) out.push({ block: b, from, to });
  }
  return out;
}

function cellsFrom(placed: Placed[]) {
  const cells: Record<string, string> = {};
  for (const { block, from, to } of placed) {
    for (const d of block.weekdays) {
      if (!DAYS.includes(d)) continue;
      for (let p = from; p <= to; p++) cells[key(d, p)] = block.title;
    }
  }
  return cells;
}

export function ClassGridDialog({ initialParity = 'all', onClose }: { initialParity?: WeekParity; onClose: () => void }) {
  const { routine_blocks, profile, categories, insertMany, update, remove } = useData();
  const periods = profile?.class_periods?.length ? profile.class_periods : DEFAULT_CLASS_PERIODS;
  const schoolCategory = categories.find((c) => c.name === 'Škola')?.id ?? null;

  const [parity, setParity] = useState<WeekParity>(initialParity);
  const placed = useMemo(() => placeBlocks(routine_blocks, periods, parity), [routine_blocks, periods, parity]);
  const [cells, setCells] = useState<Record<string, string>>(() => cellsFrom(placed));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const offGrid = routine_blocks.filter((b) => b.kind === 'class' && b.week_parity === parity).length - placed.length;
  const subjects = [...new Set(routine_blocks.filter((b) => b.kind === 'class').map((b) => b.title))].sort((a, b) =>
    a.localeCompare(b, 'sk'),
  );

  const switchParity = (p: WeekParity) => {
    if (dirty && !window.confirm('Neuložené zmeny v tejto tabuľke sa stratia. Pokračovať?')) return;
    setParity(p);
    setCells(cellsFrom(placeBlocks(routine_blocks, periods, p)));
    setDirty(false);
  };

  const setCell = (d: number, p: number, v: string) => {
    setCells((c) => ({ ...c, [key(d, p)]: v }));
    setDirty(true);
  };

  /** Enter moves down like in a spreadsheet; arrows move around. */
  const onKey = (e: KeyboardEvent<HTMLInputElement>, d: number, p: number) => {
    const moves: Record<string, [number, number]> = {
      Enter: [0, 1],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${d + m[0]}:${p + m[1]}"]`);
    next?.focus();
    next?.select();
  };

  const save = async () => {
    setBusy(true);
    const value = (d: number, p: number) => (cells[key(d, p)] ?? '').trim();
    const consumed = new Set<string>();

    // 1) existing blocks: keep the days where every covered cell still says the same subject
    for (const { block, from, to } of placed) {
      const keep = block.weekdays.filter((d) => {
        if (!DAYS.includes(d)) return true; // weekend days are not in the grid, leave them alone
        for (let p = from; p <= to; p++) if (value(d, p) !== block.title) return false;
        return true;
      });
      for (const d of keep) for (let p = from; p <= to; p++) consumed.add(key(d, p));
      if (keep.length === 0) await remove('routine_blocks', block.id);
      else if (keep.length !== block.weekdays.length) await update('routine_blocks', block.id, { weekdays: keep });
    }

    // 2) everything else is new: merge equal neighbours into double periods,
    //    then the same subject at the same time on several days into one block
    const groups = new Map<string, { title: string; from: number; to: number; days: number[] }>();
    for (const d of DAYS) {
      let p = 0;
      while (p < periods.length) {
        const title = value(d, p);
        if (!title || consumed.has(key(d, p))) {
          p++;
          continue;
        }
        let to = p;
        while (to + 1 < periods.length && value(d, to + 1) === title && !consumed.has(key(d, to + 1))) to++;
        const g = `${title}|${p}|${to}`;
        const entry = groups.get(g) ?? { title, from: p, to, days: [] };
        entry.days.push(d);
        groups.set(g, entry);
        p = to + 1;
      }
    }
    const ok = await insertMany(
      'routine_blocks',
      [...groups.values()].map((g) => ({
        title: g.title,
        kind: 'class' as const,
        weekdays: g.days,
        week_parity: parity,
        start_time: periods[g.from].start,
        end_time: periods[g.to].end,
        category_id: schoolCategory,
      })),
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="Rozvrh hodín"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="small muted">Enter skočí na ďalšiu hodinu. Prázdna bunka = voľno.</span>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Zrušiť
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Ukladám…' : 'Uložiť rozvrh'}
          </button>
        </>
      }
    >
      <Segmented
        label="Pre ktoré týždne"
        value={parity}
        onChange={switchParity}
        options={(['all', 'odd', 'even'] as WeekParity[]).map((p) => ({ value: p, label: PARITY_LABELS[p] }))}
      />
      {parity !== 'all' && (
        <p className="small muted">
          Sem píš len hodiny, ktoré sú iba v {parity === 'odd' ? 'nepárnom' : 'párnom'} týždni. Spoločné hodiny patria do
          „Každý týždeň“.
        </p>
      )}
      <div className="class-grid-wrap">
        <table className="class-grid">
          <thead>
            <tr>
              <th scope="col">Hodina</th>
              {DAYS.map((d) => (
                <th key={d} scope="col">
                  {WEEKDAY_SHORT[d - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p, pi) => (
              <tr key={pi}>
                <th scope="row">
                  <b>{pi + 1}.</b>
                  <span>
                    {p.start}–{p.end}
                  </span>
                </th>
                {DAYS.map((d) => (
                  <td key={d}>
                    <input
                      data-cell={`${d}:${pi}`}
                      value={cells[key(d, pi)] ?? ''}
                      onChange={(e) => setCell(d, pi, e.target.value)}
                      onKeyDown={(e) => onKey(e, d, pi)}
                      list="class-subjects"
                      placeholder=" "
                      aria-label={`${WEEKDAY_SHORT[d - 1]}, ${pi + 1}. hodina`}
                      maxLength={120}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="class-subjects">
        {subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {offGrid > 0 && (
        <p className="small muted">
          {offGrid} {offGrid === 1 ? 'hodina nesedí' : 'hodiny nesedia'} so zvonením, tie tu nie sú a ostanú bez zmeny.
        </p>
      )}
    </Modal>
  );
}
