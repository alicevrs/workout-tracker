import { useEffect, useRef, useState } from 'react';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { cleanBarcode, isValidBarcode } from '../lib/barcode';
import { Icon } from './Icon';

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/**
 * The browser's own barcode reader where there is one (Chrome), otherwise the bundled reader
 * (Safari on iPhone has none). The reader's engine file is served by the app, not by a CDN.
 */
async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Native?.getSupportedFormats) {
    try {
      const supported = await Native.getSupportedFormats();
      if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
    } catch {
      /* fall back to the bundled reader */
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
}

/** Full-screen camera that reads a food barcode, with a field to type the number instead. */
export function BarcodeScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTyped('');
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
      } catch {
        if (!stopped) setError('The camera is not available. Allow camera access when asked (on iPhone it can be changed in the Safari settings), or type the number below.');
        return;
      }
      let detector: Detector;
      try {
        detector = await makeDetector();
      } catch {
        if (!stopped) setError('The barcode reader could not start (it needs a connection the first time). Type the number below.');
        return;
      }
      const tick = async () => {
        if (stopped) return;
        const v = video.current;
        if (v && v.readyState >= 2) {
          try {
            const found = await detector.detect(v);
            const code = found.map((b) => cleanBarcode(b.rawValue)).find(isValidBarcode);
            if (code && !stopped) {
              stopped = true;
              navigator.vibrate?.(60);
              return onCode(code);
            }
          } catch {
            /* keep trying */
          }
        }
        timer = window.setTimeout(tick, 200);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onCode is recreated by the parent on each render; the camera only restarts when opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const code = cleanBarcode(typed);
  const valid = isValidBarcode(code);
  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <div className="scanner-top">
        <span>Scan a barcode</span>
        <button className="btn icon ghost" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="scanner-view">
        {error ? <p className="scanner-error">{error}</p> : <video ref={video} playsInline muted autoPlay />}
        {!error && <div className="scanner-frame" aria-hidden />}
      </div>
      <form
        className="scanner-type"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onCode(code);
        }}
      >
        <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Barcode number" placeholder="Barcode number" />
        <button className="btn primary" type="submit" disabled={!valid}>
          Find
        </button>
      </form>
      {code.length >= 8 && !valid && <p className="tiny faint scanner-hint">Check the number: it does not look like a complete barcode.</p>}
    </div>
  );
}
