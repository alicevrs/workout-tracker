import { useRegisterSW } from 'virtual:pwa-register/react';

/** Shows a banner when a new version of the app has been downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // Installed iPhone apps are often resumed instead of reloaded, so also look for a new
    // version whenever the app comes back to the foreground, and once an hour.
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => navigator.onLine && reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, 60 * 60 * 1000);
    },
  });

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="banner update mb" role="status">
      <div className="grow">
        {needRefresh ? 'A new version of the app is available.' : 'The app is ready to work offline.'}
      </div>
      {needRefresh ? (
        <button className="btn small update-btn" onClick={() => updateServiceWorker(true)}>
          Update
        </button>
      ) : null}
      <button
        className="btn small ghost"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
