import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type Box = { x: number; y: number; w: number; h: number }; // fractions of the photo, 0…1
type Drag = { mode: 'move' | 'tl' | 'tr' | 'bl' | 'br'; startX: number; startY: number; box: Box } | null;

const MIN = 0.08;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cut the chosen part of a photo, at full resolution. */
async function crop(file: Blob, box: Box): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sx = Math.round(box.x * bitmap.width);
  const sy = Math.round(box.y * bitmap.height);
  const sw = Math.round(box.w * bitmap.width);
  const sh = Math.round(box.h * bitmap.height);
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  c.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('crop'))), 'image/png'));
}

/** Full-screen step after taking the photo: drag the frame around the nutrition table, then Read. */
export function LabelCropper({ file, onCancel, onCropped }: { file: Blob | null; onCancel: () => void; onCropped: (part: Blob) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [box, setBox] = useState<Box>({ x: 0.1, y: 0.25, w: 0.8, h: 0.5 });
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setBox({ x: 0.1, y: 0.25, w: 0.8, h: 0.5 });
    setBusy(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!file || !url) return null;

  const start = (mode: NonNullable<Drag>['mode']) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, box };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const r = area.current?.getBoundingClientRect();
    if (!d || !r) return;
    const dx = (e.clientX - d.startX) / r.width;
    const dy = (e.clientY - d.startY) / r.height;
    const b = d.box;
    let { x, y, w, h } = b;
    if (d.mode === 'move') {
      x = clamp(b.x + dx, 0, 1 - b.w);
      y = clamp(b.y + dy, 0, 1 - b.h);
    } else {
      const left = d.mode === 'tl' || d.mode === 'bl';
      const top = d.mode === 'tl' || d.mode === 'tr';
      if (left) {
        x = clamp(b.x + dx, 0, b.x + b.w - MIN);
        w = b.x + b.w - x;
      } else w = clamp(b.w + dx, MIN, 1 - b.x);
      if (top) {
        y = clamp(b.y + dy, 0, b.y + b.h - MIN);
        h = b.y + b.h - y;
      } else h = clamp(b.h + dy, MIN, 1 - b.y);
    }
    setBox({ x, y, w, h });
  };
  const end = () => (drag.current = null);
  const read = async () => {
    setBusy(true);
    try {
      onCropped(await crop(file, box));
    } catch {
      onCropped(file);
    }
  };

  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Frame the nutrition table">
      <div className="scanner-top">
        <span>Frame the table</span>
        <button className="btn icon ghost" onClick={onCancel} aria-label="Cancel">
          <Icon name="x" />
        </button>
      </div>
      <p className="tiny faint" style={{ margin: '4px 0 0' }}>
        Drag the corners so that only the nutrition table is inside the frame.
      </p>
      <div className="crop-stage">
        <div className="crop-area" ref={area} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <img src={url} alt="" draggable={false} />
          <div className="crop-box" style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }} onPointerDown={start('move')}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <span key={c} className={`crop-handle ${c}`} onPointerDown={start(c)} />
            ))}
          </div>
        </div>
      </div>
      <div className="save-bar" style={{ paddingTop: 12 }}>
        <button className="big-btn" disabled={busy} onClick={read}>
          Read
        </button>
      </div>
    </div>
  );
}
