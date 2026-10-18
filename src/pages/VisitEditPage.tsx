import { useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/Library';
import { EmptyState, NumberField, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { Visit, VisitMeasure } from '../db/types';
import { useDraft } from '../lib/drafts';
import { formatDate, fromDateKey } from '../lib/dates';
import { uid } from '../lib/ids';
import { bmi } from '../lib/nutrition';

/** Create or edit a visit. Nothing is stored until Save. */
export default function VisitEditPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { item: visit, setItem, current, dirty, markSaved } = useDraft<Visit>(`visit:${id}`, () => db.visits.get(id));

  if (visit === undefined) return <div className="page" />;
  if (visit === null)
    return (
      <div className="page">
        <PageHeader title="Visit" back="/nutrition/visits" />
        <EmptyState title="Visit not found" />
      </div>
    );

  const update = (patch: Partial<Visit>) => {
    const cur = current();
    if (cur) setItem({ ...cur, ...patch });
  };
  const setMeasure = (mid: string, patch: Partial<VisitMeasure>) => update({ measures: visit.measures.map((m) => (m.id === mid ? { ...m, ...patch } : m)) });
  const removeMeasure = (mid: string) => update({ measures: visit.measures.filter((m) => m.id !== mid) });
  const addMeasure = () => update({ measures: [...visit.measures, { id: uid(), name: '', unit: 'cm' }] });
  const index = bmi(visit.weightKg, visit.heightCm);

  const save = async () => {
    if (!visit.date) return toast('Choose the date of the visit');
    const next: Visit = { ...visit, measures: visit.measures.filter((m) => m.name.trim()).map((m) => ({ ...m, name: m.name.trim(), unit: m.unit.trim() })), updatedAt: Date.now() };
    await db.visits.put(next);
    // The weight also goes to the weight log (one entry per date), used by the calorie estimates.
    if (next.weightKg) {
      const existing = await db.bodyWeights.where('date').equals(next.date).first();
      await db.bodyWeights.put({ id: existing?.id ?? uid(), date: next.date, weightKg: next.weightKg });
    }
    markSaved(next);
    toast('Visit saved');
  };

  return (
    <div className="page">
      <PageHeader
        title={visit.date ? formatDate(fromDateKey(visit.date).getTime()) : 'Visit'}
        back="/nutrition/visits"
        confirmLeave={dirty}
        actions={
          <InfoButton title="Visit">
            <p style={{ margin: 0 }}>Fill in what was measured; empty measures are simply skipped. Rename, add or remove measures as needed: the next visit starts with the same list.</p>
            <p style={{ margin: 0 }}>Changes are kept only when you tap Save.</p>
          </InfoButton>
        }
      />
      <div className="stack">
        <label className="field">
          Date
          <input type="date" value={visit.date} onChange={(e) => update({ date: e.target.value })} />
        </label>
        <div className="nutri-grid">
          <NumberField label="Weight" suffix="kg" value={visit.weightKg} onChange={(v) => update({ weightKg: v })} />
          <NumberField label="Height" suffix="cm" value={visit.heightCm} onChange={(v) => update({ heightCm: v })} />
        </div>
        {index !== undefined && <p className="small muted" style={{ margin: 0 }}>BMI {index}</p>}

        <section className="card">
          <h2 className="mb">Measures</h2>
          <div className="stack">
            {visit.measures.map((m) => (
              <div key={m.id} className="measure-row">
                <input className="measure-name" value={m.name} onChange={(e) => setMeasure(m.id, { name: e.target.value })} aria-label="Measure name" />
                <NumberField label={m.name || 'Value'} hideLabel value={m.value} onChange={(v) => setMeasure(m.id, { value: v })} />
                <input className="measure-unit" value={m.unit} onChange={(e) => setMeasure(m.id, { unit: e.target.value })} aria-label="Unit" />
                <button className="btn icon ghost" onClick={() => removeMeasure(m.id)} aria-label={`Remove ${m.name || 'measure'}`}>
                  <Icon name="x" size={18} />
                </button>
              </div>
            ))}
            <button className="btn small" onClick={addMeasure}>
              <Icon name="plus" /> Add a measure
            </button>
          </div>
        </section>

        <label className="field">
          Notes
          <textarea rows={3} value={visit.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
        </label>
      </div>
      <div className="save-bar">
        <button className="big-btn" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
