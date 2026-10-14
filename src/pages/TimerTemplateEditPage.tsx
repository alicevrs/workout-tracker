import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/Library';
import { TimerFields } from '../components/TimerFields';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { TimerTemplate } from '../db/types';
import { autoTimerName, cleanTimer, duplicateTimer, NEW_TIMER_NAME, syncTimer, TIMER_KINDS, unlinkTimer } from '../lib/timerTemplates';
import { defaultQuick, QUICK_LABEL, quickBlocks, quickSeconds, TIMER_INFO } from '../lib/timer/quick';
import { formatDuration } from '../lib/dates';

/** Create or edit a saved timer. Saved automatically; linked training blocks follow. */
export default function TimerTemplateEditPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const back = params.get('from') || '/workouts/timers';
  const navigate = useNavigate();
  const toast = useToast();
  const [tpl, setTpl] = useState<TimerTemplate | null | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<TimerTemplate | null>(null);
  const tplRef = useRef<TimerTemplate | null | undefined>(tpl);
  tplRef.current = tpl;

  useEffect(() => {
    db.timerTemplates.get(id).then((t) => setTpl(t ?? null));
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    if (pending.current) {
      const t = pending.current;
      pending.current = null;
      await db.timerTemplates.put(t);
      await syncTimer(db, t); // linked training blocks (and their workouts) follow
    }
  }, []);
  useEffect(() => () => void flush(), [flush]);

  const update = (patch: Partial<TimerTemplate>) => {
    const cur = tplRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    tplRef.current = next;
    setTpl(next);
    pending.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };

  if (tpl === undefined) return <div className="page" />;
  if (tpl === null)
    return (
      <div className="page">
        <PageHeader title="Timer" back={back} />
        <EmptyState title="Timer not found" />
      </div>
    );

  const t = tpl.timer;
  const nameIsAuto = tpl.name === NEW_TIMER_NAME || tpl.name === autoTimerName(t);
  const setTimer = (next: TimerTemplate['timer']) => {
    const timer = cleanTimer(next);
    update({ timer, ...(nameIsAuto ? { name: autoTimerName(timer) } : {}) });
  };
  const total = quickSeconds(quickBlocks([t], 0));

  return (
    <div className="page">
      <PageHeader
        title={tpl.name || 'Timer'}
        back={back}
        subtitle={total ? `≈ ${formatDuration(total)}` : undefined}
        actions={
          <InfoButton title={QUICK_LABEL[t.kind]}>
            {TIMER_INFO[t.kind].text.map((p) => (
              <p key={p} style={{ margin: 0 }}>
                {p}
              </p>
            ))}
            <p style={{ margin: 0 }}>Training blocks that use this timer follow every change from their next session. Workouts already done stay as they were.</p>
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
        <TimerFields noSets q={t} onChange={(q) => setTimer(q as TimerTemplate['timer'])} />

        <div className="big-buttons" style={{ paddingTop: 0 }}>
          <button
            className="btn small"
            onClick={async () => {
              await flush();
              const copy = duplicateTimer(tpl);
              await db.timerTemplates.add(copy);
              toast('Timer duplicated');
              navigate(`/workouts/timers/${copy.id}`);
            }}
          >
            <Icon name="copy" /> Duplicate
          </button>
          <button
            className="btn ghost small"
            onClick={async () => {
              if (!confirm(`Delete “${tpl.name}”? Training blocks that use it keep their current times.`)) return;
              pending.current = null;
              await unlinkTimer(db, tpl.id);
              await db.timerTemplates.delete(tpl.id);
              navigate(back);
            }}
          >
            <Icon name="trash" /> Delete timer
          </button>
        </div>
      </div>
    </div>
  );
}
