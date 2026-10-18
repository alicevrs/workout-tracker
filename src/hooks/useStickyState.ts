import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Lists remember their search, filters and scroll position while the app is open, so coming back
// from an item shows the list as it was. Kept in sessionStorage (this tab only, cleared on close).

function read<T>(key: string, initial: T): T {
  try {
    const raw = sessionStorage.getItem(`list:${key}`);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

/** useState that survives leaving the page and coming back. */
export function useStickyState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  useEffect(() => {
    try {
      sessionStorage.setItem(`list:${key}`, JSON.stringify(value));
    } catch {
      /* storage blocked: filters just reset */
    }
  }, [key, value]);
  return [value, setValue];
}

/** Restore the scroll position of a list once its items are shown (`ready`), and remember it on leave. */
export function useScrollMemory(key: string, ready: boolean): void {
  const restored = useRef(false);
  // A passive effect, so it runs after the app's scroll-to-top for the new page.
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const y = read<number>(`${key}:scroll`, 0);
    if (y > 0) window.scrollTo(0, y);
  }, [key, ready]);
  // Store the position when leaving. A layout effect: its cleanup runs before the next page
  // scrolls to the top, so it still reads the list's position.
  useLayoutEffect(
    () => () => {
      try {
        sessionStorage.setItem(`list:${key}:scroll`, JSON.stringify(window.scrollY));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
}
