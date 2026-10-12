import { useRegisterSW } from 'virtual:pwa-register/react';

/** Shows a banner when a new version of the app has been downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="banner info mb" role="status">
      <div className="grow">
        {needRefresh ? 'A new version of the app is available.' : 'The app is ready to work offline.'}
      </div>
      {needRefresh ? (
        <button className="btn small primary" onClick={() => updateServiceWorker(true)}>
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
