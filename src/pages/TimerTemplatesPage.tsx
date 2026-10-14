import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField } from '../components/Library';
import { PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { setDraft } from '../lib/drafts';
import { duplicateTimer, newTimerTemplate, unlinkTimer } from '../lib/timerTemplates';
import { describeQuick, QUICK_LABEL } from '../lib/timer/quick';

/** Library of saved timers, used to count training blocks by time. */
export default function TimerTemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const timers = useLiveQuery(() => db.timerTemplates.orderBy('name').toArray(), []);
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (timers ?? [])
      .filter((t) => !q || t.name.toLowerCase().includes(q) || QUICK_LABEL[t.timer.kind].toLowerCase().includes(q))
      .map((t) => ({ id: t.id, name: t.name, to: `/workouts/timers/${t.id}`, badge: QUICK_LABEL[t.timer.kind], sub: describeQuick(t.timer) }));
  }, [timers, query]);

  const create = () => {
    const t = newTimerTemplate();
    setDraft(`timer:${t.id}`, t, true); // stored only when saved
    navigate(`/workouts/timers/${t.id}?draft=1`);
  };
  const duplicate = async (id: string) => {
    const t = await db.timerTemplates.get(id);
    if (!t) return;
    await db.timerTemplates.add(duplicateTimer(t));
    toast('Timer duplicated');
  };
  const remove = async (id: string) => {
    const t = await db.timerTemplates.get(id);
    if (!t || !confirm(`Delete “${t.name}”? Training blocks that use it keep their current times.`)) return;
    await unlinkTimer(db, id);
    await db.timerTemplates.delete(id);
    toast('Timer deleted');
  };

  return (
    <div className="page">
      <PageHeader
        title="Timers"
        back="/workouts"
        actions={
          <InfoButton title="Timers">
            <p style={{ margin: 0 }}>Preset timers (Tabata, AMRAP, EMOM, For Time) with their rounds, minutes, rests and sets, saved once and reused.</p>
            <p style={{ margin: 0 }}>In a training block, choose “Count by → Time” and pick a saved timer: the block uses its settings with your exercises.</p>
            <p style={{ margin: 0 }}>Change a timer once and every block that uses it follows from the next session. In the list, the copy icon duplicates a timer and × deletes it.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <button className="big-btn" onClick={create}>
          <Icon name="plus" /> New timer
        </button>
      </div>
      <div className="stack">
        <SearchField value={query} onChange={setQuery} label="Search timers" />
        <LibraryList items={items} onDuplicate={duplicate} onDelete={remove} empty={query ? 'No timer matches.' : 'No timers yet.'} />
      </div>
    </div>
  );
}
