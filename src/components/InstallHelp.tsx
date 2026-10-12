export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function InstallHelp() {
  if (isStandalone()) {
    return <p className="muted">The app is installed. It works offline: all screens and the timer run without a connection.</p>;
  }
  return (
    <div className="stack">
      <div>
        <h3>iPhone or iPad (Safari)</h3>
        <ol className="muted small">
          <li>Open this page in Safari.</li>
          <li>Tap the Share button (square with an arrow).</li>
          <li>Scroll down and tap “Add to Home Screen”, then “Add”.</li>
          <li>Open the app from the new icon. After the first load it works offline.</li>
        </ol>
      </div>
      <div>
        <h3>Mac</h3>
        <ol className="muted small">
          <li>Safari (macOS Sonoma or later): File menu → “Add to Dock”.</li>
          <li>Chrome or Edge: click the install icon at the right of the address bar.</li>
          <li>You can also just keep using it in a browser tab.</li>
        </ol>
      </div>
      <p className="small faint">Data is stored on each device separately. Use Backup to move data between iPhone and Mac.</p>
    </div>
  );
}
