import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toDateKey } from '../lib/dates';
import { SportPicker } from './SportPicker';
import { Sheet } from './ui';

/** Pick a date and a sport; choosing the sport opens the activity form for that day. */
export function StartActivitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const today = toDateKey(Date.now());
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (open) setDate(toDateKey(Date.now()));
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Start an activity">
      <div className="stack">
        <label className="field">
          Date
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <SportPicker
          onChange={(id) => {
            onClose();
            navigate(`/activity/new?date=${date}&sport=${id}`);
          }}
        />
      </div>
    </Sheet>
  );
}
