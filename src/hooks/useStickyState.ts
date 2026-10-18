import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Lists keep their search, filters and scroll position only when you come back from one of their
// own items (open an exercise, look at it, Back). Coming from anywhere else starts the list fresh.
// Kept in sessionStorage (this tab only).

/** The route shown before the current one is rendered (App updates it after every navigation). */
let previousPath = '';
export function noteRoute(path: string): void {
  previousPath = path;
}

function read<T>(key: string, initial: T): T {
  try {
    const raw = sessionStorage.getItem(`list:${key}`);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}
function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(`list:${key}`, JSON.stringify(value));
  } catch {
    /* storage blocked: lists just start fresh */
  }
}

/** True when this list is shown again right after one of its items (`isItem` tells item routes). */
export function useCameBack(isItem: (path: string) => boolean): boolean {
  const [back] = useState(() => isItem(previousPath));
  return back;
}

/** useState that keeps its value only when coming back from an item of the same list. */
export function useStickyState<T>(key: string, initial: T, keep: boolean): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (keep ? read(key, initial) : initial));
  useEffect(() => write(key, value), [key, value]);
  return [value, setValue];
}

/** Restore the scroll position once the items are shown (`ready`), only when coming back; remember it on leave. */
export function useScrollMemory(key: string, ready: boolean, keep: boolean): void {
  const restored = useRef(false);
  // A passive effect, so it runs after the app's scroll-to-top for the new page.
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const y = keep ? read<number>(`${key}:scroll`, 0) : 0;
    if (y > 0) window.scrollTo(0, y);
  }, [key, ready, keep]);
  // Store the position when leaving. A layout effect: its cleanup runs before the next page
  // scrolls to the top, so it still reads the list's position.
  useLayoutEffect(() => () => write(`${key}:scroll`, window.scrollY), [key]);
}
