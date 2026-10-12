// Screen Wake Lock: keeps the screen on while a workout runs (iOS 16.4+, Safari 16.4+, Chrome).

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void acquire();
}

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator;
}

export async function keepScreenOn(on: boolean): Promise<void> {
  if (!wakeLockSupported()) return;
  wanted = on;
  if (on) {
    document.addEventListener('visibilitychange', onVisible);
    await acquire();
  } else {
    document.removeEventListener('visibilitychange', onVisible);
    try {
      await sentinel?.release();
    } catch {
      /* ignore */
    }
    sentinel = null;
  }
}
