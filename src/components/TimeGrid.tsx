import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type TouchEvent,
} from 'react';
import { isSameDay, isToday } from 'date-fns';
import { atMinutes, fmt, fmtDuration, fmtTime, minutesToTime, MINUTE } from '../lib/time';
import type { LeisureBand } from '../lib/leisure';
import { textOn } from '../lib/meta';
import { useGridDrag } from './useGridDrag';

export type GridVariant = 'routine' | 'solid' | 'pencil' | 'done';

export interface GridItem {
  id: string;
  title: string;
  detail?: string;
  start: Date;
  end: Date;
  color: string;
  variant: GridVariant;
  /** small colored dot, e.g. task priority */
  marker?: string;
  onClick?: () => void;
  /** makes the block draggable and resizable; resolve false to undo the move */
  onMove?: (start: Date, end: Date) => Promise<boolean> | void;
}

export interface StripItem {
  id: string;
  day: Date;
  title: string;
  color: string;
  kind: 'deadline' | 'reminder' | 'allday';
  onClick?: () => void;
}

interface Props {
  days: Date[];
  items: GridItem[];
  strip?: StripItem[];
  /** free time, drawn faintly behind the blocks */
  bands?: LeisureBand[];
  fromHour?: number;
  toHour?: number;
  scrollToHour?: number;
  /** show weekday names only (a generic week, not concrete dates) */
  generic?: boolean;
  onSlotClick?: (start: Date) => void;
  /** horizontal swipe on touch screens: -1 = previous, 1 = next */
  onSwipe?: (dir: 1 | -1) => void;
}

export const HOUR_PX = 48;

interface Placed extends GridItem {
  top: number;
  height: number;
  col: number;
  cols: number;
}

function layoutDay(day: Date, items: GridItem[], fromHour: number, toHour: number): Placed[] {
  const dayFrom = atMinutes(day, fromHour * 60).getTime();
  const dayTo = atMinutes(day, toHour * 60).getTime();
  const visible = items
    .filter((i) => i.start.getTime() < dayTo && i.end.getTime() > dayFrom)
    .map((i) => ({
      item: i,
      s: Math.max(i.start.getTime(), dayFrom),
      e: Math.min(Math.max(i.end.getTime(), i.start.getTime() + 15 * MINUTE), dayTo),
    }))
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let columnsEnd: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const p of cluster) p.cols = columnsEnd.length;
    cluster = [];
    columnsEnd = [];
  };

  for (const v of visible) {
    if (v.s >= clusterEnd) flush();
    let col = columnsEnd.findIndex((end) => end <= v.s);
    if (col === -1) {
      col = columnsEnd.length;
      columnsEnd.push(v.e);
    } else columnsEnd[col] = v.e;
    clusterEnd = Math.max(clusterEnd, v.e);
    const p: Placed = {
      ...v.item,
      top: ((v.s - dayFrom) / (60 * MINUTE)) * HOUR_PX,
      height: Math.max(((v.e - v.s) / (60 * MINUTE)) * HOUR_PX, 18),
      col,
      cols: 1,
    };
    cluster.push(p);
    placed.push(p);
  }
  flush();
  return placed;
}

export function TimeGrid({
  days,
  items,
  strip = [],
  bands = [],
  fromHour = 0,
  toHour = 24,
  scrollToHour = 7,
  generic = false,
  onSlotClick,
  onSwipe,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const [now, setNow] = useState(() => new Date());
  // positions shown right after a drop, until the saved data comes back
  const [pending, setPending] = useState<Record<string, { start: Date; end: Date }>>({});
  const hours = useMemo(() => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i), [fromHour, toHour]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (scrollToHour - fromHour - 0.5) * HOUR_PX);
  }, [scrollToHour, fromHour]);

  // drop an optimistic position once the real data agrees with it
  useEffect(() => {
    setPending((p) => {
      const next = { ...p };
      let changed = false;
      for (const [id, pos] of Object.entries(p)) {
        const item = items.find((i) => i.id === id);
        if (!item || (item.start.getTime() === pos.start.getTime() && item.end.getTime() === pos.end.getTime())) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : p;
    });
  }, [items]);

  const shown = useMemo(
    () => items.map((i) => (pending[i.id] ? { ...i, ...pending[i.id] } : i)),
    [items, pending],
  );

  const onDrop = useCallback(
    (item: GridItem, dayIndex: number, startMin: number, endMin: number) => {
      const day = days[dayIndex];
      if (!day || !item.onMove) return;
      const start = atMinutes(day, startMin);
      const end = atMinutes(day, endMin);
      if (start.getTime() === item.start.getTime() && end.getTime() === item.end.getTime()) return;
      setPending((p) => ({ ...p, [item.id]: { start, end } }));
      const undo = () =>
        setPending((p) => {
          const next = { ...p };
          delete next[item.id];
          return next;
        });
      Promise.resolve(item.onMove(start, end)).then((ok) => ok === false && undo());
      setTimeout(undo, 8000); // safety net if the update never echoes back
    },
    [days],
  );

  const { preview, start: startDrag, consumeClickSuppression } = useGridDrag({
    scroller,
    columns,
    fromHour,
    toHour,
    hourPx: HOUR_PX,
    onDrop,
  });

  const perDay = useMemo(
    () => days.map((d) => layoutDay(d, shown, fromHour, toHour)),
    [days, shown, fromHour, toHour],
  );
  const hasStrip = strip.length > 0;

  const handleColumnClick = (day: Date, e: MouseEvent<HTMLDivElement>) => {
    if (!onSlotClick || e.target !== e.currentTarget) return;
    const y = e.nativeEvent.offsetY;
    const minutes = fromHour * 60 + Math.floor(((y / HOUR_PX) * 60) / 15) * 15;
    onSlotClick(atMinutes(day, minutes));
  };

  // swipe between days on touch screens (ignored while dragging a block)
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || !onSwipe || preview) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Date.now() - s.t < 600 && Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
  };

  // does the dragged block land on top of something else?
  const conflict = useMemo(() => {
    if (!preview) return false;
    const day = days[preview.dayIndex];
    if (!day) return false;
    const s = atMinutes(day, preview.startMin).getTime();
    const e = atMinutes(day, preview.endMin).getTime();
    return shown.some(
      (i) => i.id !== preview.id && isSameDay(i.start, day) && i.start.getTime() < e && i.end.getTime() > s,
    );
  }, [preview, days, shown]);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - fromHour * 60) / 60) * HOUR_PX;
  const style = { '--days': days.length, '--hour': `${HOUR_PX}px` } as CSSProperties;
  const dragged = preview ? shown.find((i) => i.id === preview.id) : undefined;

  return (
    <div
      className={`grid${days.length === 1 ? ' grid-single-day' : ''}${days.length >= 5 ? ' grid-dense' : ''}${preview ? ' is-dragging' : ''}`}
      style={style}
    >
      <div className="grid-head">
        <div className="grid-gutter" />
        {days.map((d) => (
          <div key={d.toISOString()} className={`grid-day-head${!generic && isToday(d) ? ' is-today' : ''}`}>
            <span className="dow">{fmt(d, generic ? 'EEEE' : 'EEE')}</span>
            {!generic && <span className="dom">{fmt(d, 'd.')}</span>}
          </div>
        ))}
      </div>

      {hasStrip && (
        <div className="grid-strip">
          <div className="grid-gutter strip-label" title="Celý deň">
            <span className="strip-label-long">celý deň</span>
          </div>
          {days.map((d) => (
            <div key={d.toISOString()} className="strip-cell">
              {strip
                .filter((s) => isSameDay(s.day, d))
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`strip-chip chip-${s.kind}`}
                    style={{ '--c': s.color } as CSSProperties}
                    onClick={s.onClick}
                    title={s.title}
                  >
                    {s.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid-scroll" ref={scroller} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="grid-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="grid-gutter hours">
            {hours.map((h) => (
              <div key={h} className="hour-label" style={{ top: (h - fromHour) * HOUR_PX }}>
                {h}:00
              </div>
            ))}
          </div>
          {days.map((d, di) => {
            const today = !generic && isToday(d);
            return (
              <div
                key={d.toISOString()}
                ref={(el) => {
                  columns.current[di] = el;
                }}
                className={`grid-col${today ? ' is-today' : ''}`}
                onClick={(e) => handleColumnClick(d, e)}
              >
                {bands
                  .filter((b) => isSameDay(b.day, d))
                  .map((b) => {
                    const top = ((b.start.getTime() - atMinutes(d, fromHour * 60).getTime()) / (60 * MINUTE)) * HOUR_PX;
                    const height = ((b.end.getTime() - b.start.getTime()) / (60 * MINUTE)) * HOUR_PX;
                    const mins = (b.end.getTime() - b.start.getTime()) / MINUTE;
                    return (
                      <div
                        key={b.id}
                        className={`leisure-band${b.gap ? ' is-gap' : ''}`}
                        style={{ top, height }}
                        title={`${b.gap ? 'Voľno medzi prácou' : 'Voľný čas'}, ${fmtTime(b.start)}–${fmtTime(b.end)}`}
                        aria-hidden="true"
                      >
                        {height >= 22 && (
                          <span className="leisure-label">
                            {b.gap ? 'voľno' : 'voľný čas'}
                            {height >= 40 && <span className="leisure-len"> {fmtDuration(mins)}</span>}
                          </span>
                        )}
                      </div>
                    );
                  })}
                {perDay[di].map((p) => (
                  <button
                    type="button"
                    key={`${p.id}-${di}`}
                    className={`block block-${p.variant}${p.onMove ? ' is-movable' : ''}${preview?.id === p.id ? ' is-source' : ''}`}
                    style={
                      {
                        '--c': p.color,
                        '--fg': textOn(p.color),
                        top: p.top,
                        height: p.height,
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                        width: `calc(${100 / p.cols}% - 4px)`,
                      } as CSSProperties
                    }
                    onPointerDown={p.onMove ? (e) => startDrag(e, p) : undefined}
                    onContextMenu={p.onMove ? (e) => e.preventDefault() : undefined}
                    onClick={() => {
                      if (consumeClickSuppression()) return;
                      p.onClick?.();
                    }}
                    title={`${p.title}, ${fmtTime(p.start)}–${fmtTime(p.end)}${p.onMove ? '. Ťahaj na presun, spodný okraj mení dĺžku.' : ''}`}
                  >
                    <span className="block-title">
                      {p.marker && <i className="marker" style={{ background: p.marker }} />}
                      {p.title}
                    </span>
                    {p.height >= 34 && (
                      <span className="block-time">
                        {fmtTime(p.start)}–{fmtTime(p.end)}
                      </span>
                    )}
                    {p.detail && p.height >= 56 && <span className="block-detail">{p.detail}</span>}
                    {p.onMove && <span className="resize-handle" data-resize aria-hidden="true" />}
                  </button>
                ))}

                {preview && dragged && preview.dayIndex === di && (
                  <div
                    className={`block block-${dragged.variant} block-ghost${conflict ? ' is-conflict' : ''}`}
                    style={
                      {
                        '--c': dragged.color,
                        '--fg': textOn(dragged.color),
                        top: ((preview.startMin - fromHour * 60) / 60) * HOUR_PX,
                        height: Math.max(((preview.endMin - preview.startMin) / 60) * HOUR_PX, 18),
                        left: 2,
                        right: 2,
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  >
                    <span className="block-title">{dragged.title}</span>
                    <span className="block-time">
                      {minutesToTime(preview.startMin)}–{minutesToTime(preview.endMin)}
                      {conflict ? ', prekrýva sa' : ''}
                    </span>
                  </div>
                )}

                {today && nowTop >= 0 && nowTop <= hours.length * HOUR_PX && (
                  <div className="now-line" style={{ top: nowTop }} aria-label={`Teraz ${fmtTime(now)}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
