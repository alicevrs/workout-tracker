import { useEffect, useRef } from 'react';

/**
 * Swipe the page to the right to go back (an installed iPhone web app has no system back gesture).
 * Ignored when the swipe starts on something that moves sideways or takes input: chip rows,
 * number fields, pickers, draggable rows.
 */
export function useSwipeBack(onBack: () => void): void {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    let sx = 0;
    let sy = 0;
    let t0 = 0;
    let on = false;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const el = e.target as Element | null;
      on = !el?.closest('input, textarea, select, button, .scroll-x, .stepper, .vbox, [data-drag-index], .sheet');
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      t0 = Date.now();
    };
    const end = (e: TouchEvent) => {
      if (!on) return;
      on = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = Math.abs(t.clientY - sy);
      if (dx > 80 && dy < Math.min(60, dx * 0.5) && Date.now() - t0 < 800) cb.current();
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchend', end);
    };
  }, []);
}
