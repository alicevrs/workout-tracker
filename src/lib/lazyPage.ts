import { lazy, type ComponentType } from 'react';

/**
 * React.lazy that survives a new deployment: if a page chunk from the old version is gone,
 * reload once to fetch the new version instead of showing a blank screen.
 */
export function lazyPage<T extends ComponentType<unknown>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      sessionStorage.removeItem('chunk-reload');
      return mod;
    } catch (e) {
      if (!sessionStorage.getItem('chunk-reload')) {
        sessionStorage.setItem('chunk-reload', '1');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw e;
    }
  });
}
