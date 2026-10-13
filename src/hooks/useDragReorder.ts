import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { vibrate } from '../lib/timer/audio';

/**
 * Hold an item for a moment, then drag it up or down to reorder (touch and mouse).
 * Rows inside `listRef` need `data-drag-index={i}`; spread `handle(i)` on the part you hold.
 * Scrolling is blocked only while dragging; moving the finger before the hold ends scrolls.
 */
export function useDragReorder(listRef: RefObject<HTMLElement | null>, count: number, move: (from: number, to: number) => void, onStart?: () => void) {
  const [drag, setDrag] = useState<{ index: number; offset: number } | null>(null);
  const press = useRef<{ timer: number; startY: number; index: number; dragging: boolean } | null>(null);
  const justDragged = useRef(false);
  const live = useRef({ count, move, onStart });
  live.current = { count, move, onStart };

  const rowHeight = (i: number) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-drag-index="${i}"]`);
    if (!el) return 0;
    const gap = parseFloat(getComputedStyle(el.parentElement ?? el).rowGap || '0') || 0;
    return el.getBoundingClientRect().height + gap;
  };

  const begin = () => {
    const st = press.current;
    if (!st) return;
    st.dragging = true;
    live.current.onStart?.();
    vibrate(30);
    setDrag({ index: st.index, offset: 0 });
    const onMove = (e: PointerEvent) => {
      let offset = e.clientY - st.startY;
      if (offset > 0 && st.index < live.current.count - 1 && offset > rowHeight(st.index + 1) / 2) {
        const h = rowHeight(st.index + 1);
        live.current.move(st.index, st.index + 1);
        st.index += 1;
        st.startY += h;
        offset -= h;
      } else if (offset < 0 && st.index > 0 && -offset > rowHeight(st.index - 1) / 2) {
        const h = rowHeight(st.index - 1);
        live.current.move(st.index, st.index - 1);
        st.index -= 1;
        st.startY -= h;
        offset += h;
      }
      setDrag({ index: st.index, offset });
    };
    const noScroll = (e: TouchEvent) => e.preventDefault();
    const end = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.removeEventListener('touchmove', noScroll);
      press.current = null;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 50);
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    document.addEventListener('touchmove', noScroll, { passive: false });
  };

  const handle = (i: number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      press.current = { timer: window.setTimeout(begin, 350), startY: e.clientY, index: i, dragging: false };
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const st = press.current;
      if (st && !st.dragging && Math.abs(e.clientY - st.startY) > 8) {
        clearTimeout(st.timer);
        press.current = null;
      }
    },
    onPointerUp: () => {
      const st = press.current;
      if (st && !st.dragging) {
        clearTimeout(st.timer);
        press.current = null;
      }
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  });

  /** Style for row i (the dragged row follows the finger). */
  const rowStyle = (i: number) => (drag?.index === i ? { transform: `translateY(${drag.offset}px)` } : undefined);

  return { drag, handle, rowStyle, wasDragged: () => justDragged.current };
}
