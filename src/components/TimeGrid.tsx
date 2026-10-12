import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { isSameDay, isToday } from 'date-fns';
import { atMinutes, fmt, fmtTime, MINUTE } from '../lib/time';
import { textOn } from '../lib/meta';

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
  fromHour?: number;
  toHour?: number;
  scrollToHour?: number;
  /** show weekday names only (a generic week, not concrete dates) */
  generic?: boolean;
  onSlotClick?: (start: Date) => void;
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
  fromHour = 0,
  toHour = 24,
  scrollToHour = 7,
  generic = false,
  onSlotClick,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const hours = useMemo(() => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i), [fromHour, toHour]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (scrollToHour - fromHour - 0.5) * HOUR_PX);
  }, [scrollToHour, fromHour]);

  const perDay = useMemo(
    () => days.map((d) => layoutDay(d, items, fromHour, toHour)),
    [days, items, fromHour, toHour],
  );
  const hasStrip = strip.length > 0;

  const handleColumnClick = (day: Date, e: MouseEvent<HTMLDivElement>) => {
    if (!onSlotClick || e.target !== e.currentTarget) return;
    const y = e.nativeEvent.offsetY;
    const minutes = fromHour * 60 + Math.floor(((y / HOUR_PX) * 60) / 15) * 15;
    onSlotClick(atMinutes(day, minutes));
  };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - fromHour * 60) / 60) * HOUR_PX;
  const style = { '--days': days.length, '--hour': `${HOUR_PX}px` } as CSSProperties;

  return (
    <div className="grid" style={style}>
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
          <div className="grid-gutter strip-label">celý deň</div>
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

      <div className="grid-scroll" ref={scroller}>
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
                className={`grid-col${today ? ' is-today' : ''}`}
                onClick={(e) => handleColumnClick(d, e)}
              >
                {perDay[di].map((p) => (
                  <button
                    type="button"
                    key={`${p.id}-${di}`}
                    className={`block block-${p.variant}`}
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
                    onClick={p.onClick}
                    title={`${p.title}, ${fmtTime(p.start)}–${fmtTime(p.end)}`}
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
                  </button>
                ))}
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
