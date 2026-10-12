import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { GridItem } from './TimeGrid';

const SNAP = 15; // minutes
const MOUSE_THRESHOLD = 5; // px before a press becomes a drag
const TOUCH_HOLD_MS = 350; // long press on touch, so normal swipes still scroll
const TOUCH_SLOP = 8; // px a finger may wobble during the long press
const EDGE = 48; // px from the scroller edge where auto-scroll kicks in

export interface DragPreview {
  id: string;
  dayIndex: number;
  startMin: number; // minutes after midnight
  endMin: number;
}

interface DragState {
  item: GridItem;
  mode: 'move' | 'resize';
  pointerId: number;
  pointerType: string;
  el: HTMLElement;
  x0: number;
  y0: number;
  x: number;
  y: number;
  grabOffsetMin: number;
  durationMin: number;
  startMin: number;
  dayIndex: number; // column the block started in
  active: boolean;
  holdTimer?: ReturnType<typeof setTimeout>;
}

interface Options {
  scroller: RefObject<HTMLDivElement | null>;
  columns: RefObject<(HTMLDivElement | null)[]>;
  fromHour: number;
  toHour: number;
  hourPx: number;
  /** called on drop; resolve false to roll the optimistic position back */
  onDrop: (item: GridItem, dayIndex: number, startMin: number, endMin: number) => void;
}

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

/**
 * Pointer-based drag & drop for time blocks: mouse drags after a few pixels,
 * touch after a long press (a quick swipe keeps scrolling the grid).
 * Dragging the bottom edge resizes instead of moving.
 */
export function useGridDrag({ scroller, columns, fromHour, toHour, hourPx, onDrop }: Options) {
  const drag = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const suppressClick = useRef(false);
  const raf = useRef<number | null>(null);

  const compute = useCallback((): DragPreview | null => {
    const d = drag.current;
    const cols = columns.current;
    if (!d || !cols?.length) return null;

    // which day column is under the pointer (clamped to the first/last one)
    let dayIndex = 0;
    let best = Infinity;
    cols.forEach((col, i) => {
      if (!col) return;
      const r = col.getBoundingClientRect();
      const dist = d.x < r.left ? r.left - d.x : d.x > r.right ? d.x - r.right : 0;
      if (dist < best) {
        best = dist;
        dayIndex = i;
      }
    });
    const col = cols[dayIndex];
    if (!col) return null;
    const pointerMin = fromHour * 60 + ((d.y - col.getBoundingClientRect().top) / hourPx) * 60;
    const lo = fromHour * 60;
    const hi = toHour * 60;

    if (d.mode === 'resize') {
      const endMin = Math.min(hi, Math.max(d.startMin + SNAP, snap(pointerMin)));
      return { id: d.item.id, dayIndex: d.dayIndex, startMin: d.startMin, endMin };
    }
    const startMin = Math.min(hi - d.durationMin, Math.max(lo, snap(pointerMin - d.grabOffsetMin)));
    return { id: d.item.id, dayIndex, startMin, endMin: startMin + d.durationMin };
  }, [columns, fromHour, toHour, hourPx]);

  const stopAutoScroll = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  // keep scrolling while the pointer rests near the top/bottom edge
  const autoScroll = useCallback(() => {
    const d = drag.current;
    const sc = scroller.current;
    if (!d?.active || !sc) return stopAutoScroll();
    const r = sc.getBoundingClientRect();
    const speed = d.y < r.top + EDGE ? -(r.top + EDGE - d.y) / 4 : d.y > r.bottom - EDGE ? (d.y - (r.bottom - EDGE)) / 4 : 0;
    if (speed !== 0) {
      sc.scrollTop += speed;
      setPreview(compute());
    }
    raf.current = requestAnimationFrame(autoScroll);
  }, [scroller, compute]);

  const activate = useCallback(() => {
    const d = drag.current;
    if (!d || d.active) return;
    d.active = true;
    try {
      d.el.setPointerCapture(d.pointerId);
    } catch {
      /* pointer already gone */
    }
    if (d.pointerType === 'touch') navigator.vibrate?.(12);
    setPreview(compute());
    raf.current = requestAnimationFrame(autoScroll);
  }, [compute, autoScroll]);

  const end = useCallback(
    (commit: boolean) => {
      const d = drag.current;
      if (!d) return;
      clearTimeout(d.holdTimer);
      stopAutoScroll();
      if (d.active) {
        // the click that follows a drag must not open the dialog; expire if no click comes
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 80);
        const p = compute();
        if (commit && p) onDrop(d.item, p.dayIndex, p.startMin, p.endMin);
      }
      drag.current = null;
      setPreview(null);
    },
    [compute, onDrop],
  );

  /** Attach to a draggable block's onPointerDown. */
  const start = useCallback(
    (e: ReactPointerEvent<HTMLElement>, item: GridItem) => {
      if (e.button !== 0 || !item.onMove) return;
      const resize = (e.target as HTMLElement).dataset.resize !== undefined;
      const startMin = minutesOf(item.start);
      const durationMin = Math.max(SNAP, Math.round((item.end.getTime() - item.start.getTime()) / 60_000));
      const colEl = e.currentTarget.parentElement as HTMLDivElement;
      const col = colEl.getBoundingClientRect();
      const pointerMin = fromHour * 60 + ((e.clientY - col.top) / hourPx) * 60;
      drag.current = {
        item,
        mode: resize ? 'resize' : 'move',
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        el: e.currentTarget,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        grabOffsetMin: pointerMin - startMin,
        durationMin,
        startMin,
        dayIndex: Math.max(0, columns.current?.indexOf(colEl) ?? 0),
        active: false,
      };
      if (e.pointerType === 'touch') drag.current.holdTimer = setTimeout(activate, TOUCH_HOLD_MS);
    },
    [activate, columns, fromHour, hourPx],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      const moved = Math.hypot(d.x - d.x0, d.y - d.y0);
      if (!d.active) {
        if (d.pointerType === 'touch') {
          if (moved > TOUCH_SLOP) end(false); // it's a scroll, not a long press
        } else if (moved > MOUSE_THRESHOLD) activate();
        return;
      }
      setPreview(compute());
    };
    const onUp = (e: PointerEvent) => drag.current?.pointerId === e.pointerId && end(true);
    const onCancel = (e: PointerEvent) => drag.current?.pointerId === e.pointerId && end(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && drag.current?.active && end(false);
    // once a touch drag is active, the page must not scroll under the finger
    const onTouchMove = (e: TouchEvent) => drag.current?.active && e.cancelable && e.preventDefault();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [activate, compute, end]);

  /** True once if a drag just ended, so the block's click handler can ignore that click. */
  const consumeClickSuppression = () => {
    const s = suppressClick.current;
    suppressClick.current = false;
    return s;
  };

  return { preview, start, consumeClickSuppression };
}
