// Unsaved edits of workouts, training blocks and timers. Nothing is written to the database until
// the user taps Save; leaving the page discards the changes.
//
// The draft is kept (in sessionStorage, so an iPhone reload does not lose it) only to come back to
// it from a page opened inside the editor (a workout opens its training block, a block opens its
// timer). Those pages link back with `?draft=1`; any other way of opening an editor starts from
// the saved version.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

interface Draft<T> {
  item: T;
  isNew: boolean;
}

const PREFIX = 'draft:';
const mem = new Map<string, string>();

function read<T>(key: string): Draft<T> | undefined {
  let raw: string | null | undefined;
  try {
    raw = sessionStorage.getItem(PREFIX + key);
  } catch {
    raw = mem.get(key);
  }
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Draft<T>;
  } catch {
    return undefined;
  }
}

export function setDraft<T>(key: string, item: T, isNew: boolean): void {
  const raw = JSON.stringify({ item, isNew });
  try {
    sessionStorage.setItem(PREFIX + key, raw);
  } catch {
    mem.set(key, raw);
  }
}

export function getDraft<T>(key: string): Draft<T> | undefined {
  return read<T>(key);
}

/** Add `draft=1` to a URL (hash route path with an optional query). */
export function withDraftParam(url: string): string {
  const [path, query = ''] = url.split('?');
  const q = new URLSearchParams(query);
  q.set('draft', '1');
  return `${path}?${q.toString()}`;
}

/**
 * Editor state with an explicit save. `load` reads the saved version (undefined = not found);
 * `refresh` brings linked content of a resumed draft up to date (e.g. a block saved meanwhile).
 */
export function useDraft<T>(key: string, load: () => Promise<T | undefined>, refresh?: (item: T) => Promise<T>) {
  const [params] = useSearchParams();
  const resume = params.get('draft') === '1';
  const [item, setState] = useState<T | null | undefined>(undefined);
  const [saved, setSaved] = useState<T | null>(null);
  const [isNew, setIsNew] = useState(false);
  const ref = useRef<{ item: T | null | undefined; isNew: boolean }>({ item: undefined, isNew: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      const draft = resume ? read<T>(key) : undefined;
      const base = (await load()) ?? null;
      let current: T | null = draft ? draft.item : base;
      if (current && draft && refresh) current = await refresh(current);
      const fresh = draft ? draft.isNew : false;
      if (!alive) return;
      ref.current = { item: current, isNew: fresh };
      setSaved(base);
      setIsNew(fresh);
      setState(current);
      if (current) setDraft(key, current, fresh);
    })();
    return () => {
      alive = false;
    };
    // load/refresh are recreated on each render; the key and the resume flag decide when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resume]);

  const setItem = useCallback(
    (next: T) => {
      ref.current = { ...ref.current, item: next };
      setState(next);
      setDraft(key, next, ref.current.isNew);
    },
    [key],
  );

  /** Call after writing `item` to the database. */
  const markSaved = useCallback(
    (next: T) => {
      ref.current = { item: next, isNew: false };
      setSaved(next);
      setIsNew(false);
      setState(next);
      setDraft(key, next, false);
    },
    [key],
  );

  const dirty = !!item && (isNew || JSON.stringify(item) !== JSON.stringify(saved));
  return { item, setItem, current: () => ref.current.item, dirty, isNew, markSaved };
}
