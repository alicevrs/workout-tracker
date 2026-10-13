import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList, SearchField } from '../components/Library';
import { PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import { duplicateTemplate, newBlockTemplate } from '../lib/blockTemplates';
import { describeBlock, FORMAT_INFO } from '../lib/program';

/** Library of exercise templates (ready-made blocks). */
export default function ExerciseTemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const templates = useLiveQuery(() => db.blockTemplates.orderBy('name').toArray(), []);
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (templates ?? [])
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.block.entries.some((e) => exercises.get(e.exerciseId)?.name.toLowerCase().includes(q)))
      .map((t) => ({ id: t.id, name: t.name, to: `/workouts/exercise-templates/${t.id}`, badge: FORMAT_INFO[t.block.format].short, sub: describeBlock(t.block) }));
  }, [templates, query, exercises]);

  const create = async () => {
    const t = newBlockTemplate('sets_reps', profile.defaultPrepSec);
    await db.blockTemplates.add(t);
    navigate(`/workouts/exercise-templates/${t.id}`);
  };
  const duplicate = async (id: string) => {
    const t = await db.blockTemplates.get(id);
    if (!t) return;
    const copy = duplicateTemplate(t);
    await db.blockTemplates.add(copy);
    toast('Template duplicated');
    navigate(`/workouts/exercise-templates/${copy.id}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Exercise templates"
        back="/workouts"
        actions={
          <InfoButton title="Exercise templates">
            <p style={{ margin: 0 }}>
              Ready-made pieces of a workout: exercises from the catalogue with their format, sets, reps, weights, rest and timer already set (e.g. “Hip thrust EMOM 2 × 12”).
            </p>
            <p style={{ margin: 0 }}>Add them to a workout template in one tap. The copy icon makes a duplicate to adapt.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <button className="big-btn" onClick={create}>
          <Icon name="plus" /> New exercise template
        </button>
      </div>
      {(templates?.length ?? 0) > 6 && <SearchField value={query} onChange={setQuery} label="Search exercise templates" />}
      <LibraryList
        items={items}
        onDuplicate={duplicate}
        empty={query ? 'No template matches.' : 'No exercise templates yet. You can also save any part of a workout as a template.'}
      />
    </div>
  );
}
