import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BlockEditor } from '../components/BlockEditor';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { BlockTemplate } from '../db/types';
import { duplicateTemplate } from '../lib/blockTemplates';
import { formatDuration } from '../lib/dates';
import { estimateBlockSeconds } from '../lib/program';

/** Edit one exercise template. Changes are saved automatically. */
export default function ExerciseTemplateEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [tpl, setTpl] = useState<BlockTemplate | null | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<BlockTemplate | null>(null);

  useEffect(() => {
    db.blockTemplates.get(id).then((t) => setTpl(t ?? null));
  }, [id]);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    if (pending.current) {
      const t = pending.current;
      pending.current = null;
      await db.blockTemplates.put(t);
    }
  }, []);
  useEffect(() => () => void flush(), [flush]);

  if (tpl === undefined) return <div className="page" />;
  if (tpl === null)
    return (
      <div className="page">
        <PageHeader title="Exercise template" back="/workouts/exercise-templates" />
        <EmptyState title="Template not found" />
      </div>
    );

  const update = (patch: Partial<BlockTemplate>) => {
    const next = { ...tpl, ...patch, updatedAt: Date.now() };
    setTpl(next);
    pending.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };
  const total = estimateBlockSeconds(tpl.block);

  return (
    <div className="page">
      <PageHeader title={tpl.name || 'Exercise template'} back="/workouts/exercise-templates" subtitle={total ? `≈ ${formatDuration(total)}` : undefined} />
      <div className="stack">
        <label className="field">
          Name
          <input value={tpl.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <section className="card">
          <BlockEditor hideName block={tpl.block} onChange={(block) => update({ block })} />
        </section>
        <div className="big-buttons" style={{ paddingTop: 0 }}>
          <button
            className="big-btn"
            onClick={async () => {
              await flush();
              const copy = duplicateTemplate(tpl);
              await db.blockTemplates.add(copy);
              toast('Template duplicated');
              navigate(`/workouts/exercise-templates/${copy.id}`);
            }}
          >
            <Icon name="copy" /> Duplicate
          </button>
          <button
            className="btn ghost small"
            onClick={async () => {
              if (!confirm(`Delete “${tpl.name}”? Workouts that already use it keep their copy.`)) return;
              pending.current = null;
              await db.blockTemplates.delete(tpl.id);
              navigate('/workouts/exercise-templates');
            }}
          >
            <Icon name="trash" /> Delete template
          </button>
        </div>
      </div>
    </div>
  );
}
