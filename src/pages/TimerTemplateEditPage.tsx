import { useParams, useSearchParams } from 'react-router-dom';
import { InfoButton } from '../components/Library';
import { TimerFields } from '../components/TimerFields';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { TimerTemplate } from '../db/types';
import { useDraft } from '../lib/drafts';
import { autoTimerName, NEW_TIMER_NAME, syncTimer, TIMER_KINDS } from '../lib/timerTemplates';
import { defaultQuick, QUICK_LABEL, quickBlocks, quickSeconds, TIMER_INFO } from '../lib/timer/quick';
import { formatDuration } from '../lib/dates';

/** Create or edit a saved timer. Nothing is stored until Save; linked training blocks follow on save. */
export default function TimerTemplateEditPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const back = params.get('from') || '/workouts/timers';
  const toast = useToast();
  const { item: tpl, setItem, current, dirty, markSaved } = useDraft<TimerTemplate>(`timer:${id}`, () => db.timerTemplates.get(id));

  if (tpl === undefined) return <div className="page" />;
  if (tpl === null)
    return (
      <div className="page">
        <PageHeader title="Timer" back={back} />
        <EmptyState title="Timer not found" />
      </div>
    );

  const update = (patch: Partial<TimerTemplate>) => {
    const cur = current();
    if (cur) setItem({ ...cur, ...patch });
  };
  const t = tpl.timer;
  const nameIsAuto = tpl.name === NEW_TIMER_NAME || tpl.name === autoTimerName(t);
  const setTimer = (timer: TimerTemplate['timer']) => update({ timer, ...(nameIsAuto ? { name: autoTimerName(timer) } : {}) });
  const total = quickSeconds(quickBlocks([t], 0));

  const save = async () => {
    const next = { ...tpl, name: tpl.name.trim() || autoTimerName(t), updatedAt: Date.now() };
    await db.timerTemplates.put(next);
    await syncTimer(db, next); // linked training blocks (and their workouts) follow
    markSaved(next);
    toast('Timer saved');
  };

  return (
    <div className="page">
      <PageHeader
        title={tpl.name || 'Timer'}
        back={back}
        confirmLeave={dirty}
        subtitle={total ? `≈ ${formatDuration(total)}` : undefined}
        actions={
          <InfoButton title={QUICK_LABEL[t.kind]}>
            {TIMER_INFO[t.kind].text.map((p) => (
              <p key={p} style={{ margin: 0 }}>
                {p}
              </p>
            ))}
            <p style={{ margin: 0 }}>Changes are kept only when you tap Save. Training blocks that use this timer then follow from their next session; workouts already done stay as they were.</p>
          </InfoButton>
        }
      />
      <div className="stack">
        <label className="field">
          Name
          <input value={tpl.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <div className="scroll-x" role="group" aria-label="Timer type">
          {TIMER_KINDS.map((k) => (
            <button key={k} className="chip" aria-pressed={t.kind === k} onClick={() => k !== t.kind && setTimer(defaultQuick(k) as TimerTemplate['timer'])}>
              {QUICK_LABEL[k]}
            </button>
          ))}
        </div>
        <TimerFields q={t} onChange={(q) => setTimer(q as TimerTemplate['timer'])} />
      </div>
      <div className="save-bar">
        <button className="big-btn" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
