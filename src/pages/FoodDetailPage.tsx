import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { InfoButton } from '../components/Library';
import { EmptyState, NumberField, PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { Food } from '../db/types';
import { useFoods } from '../hooks/useFoods';
import { CREA_SOURCE, nutrientsFor, round1 } from '../lib/nutrition';
import { OFF_SOURCE } from '../lib/barcode';
import { getDraft } from '../lib/drafts';
import { LABEL_NAMES, LabelError, readLabelPhoto, type LabelValues } from '../lib/readLabelPhoto';
import { Icon } from '../components/Icon';
import { LabelCropper } from '../components/LabelCropper';
import { uid } from '../lib/ids';

const blankFood = (): Food => ({ id: uid(), name: '', category: '', source: 'custom', kcal: 0, protein: 0, carbs: 0, fat: 0 });

/** A reference food (read only, with its source) or one of the user's own foods (editable, explicit Save). */
export default function FoodDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const copyOf = params.get('copy');
  const { foods, map } = useFoods();
  const isNew = id === 'new';
  const food = isNew ? undefined : map.get(id);
  const scannedParam = params.get('scanned');
  const barcode = params.get('barcode') ?? undefined;
  // A new food is set up once per visit of the page (not on every refresh of the archive).
  const fresh = useMemo<Food | undefined>(() => {
    if (!isNew || !foods) return undefined;
    const scanned = scannedParam ? getDraft<Food>('food:scanned')?.item : undefined;
    if (scanned) return scanned;
    const source = copyOf ? map.get(copyOf) : undefined;
    if (source) return { ...source, id: uid(), name: source.source === 'custom' ? `${source.name} (copy)` : source.name, source: 'custom', barcode: undefined, origin: undefined };
    return { ...blankFood(), barcode };
    // map is complete once foods is loaded; it is not a reason to start over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, !!foods, copyOf, scannedParam, barcode]);

  if (!foods) return <div className="page" />;
  if (!isNew && !food)
    return (
      <div className="page">
        <PageHeader title="Food" back="/nutrition/foods" />
        <EmptyState title="Food not found" />
      </div>
    );
  if (food && food.source !== 'custom') return <ReferenceFood food={food} />;
  const start = (food ?? fresh)!;
  return <OwnFood key={start.id} initial={start} isNew={isNew} />;
}

function ReferenceFood({ food }: { food: Food }) {
  const portion = food.portionG ? nutrientsFor(food, food.portionG) : undefined;
  const rows: [string, number | undefined, string, number | undefined][] = [
    ['Energy', food.kcal, 'kcal', portion?.kcal],
    ['Protein', food.protein, 'g', portion?.protein],
    ['Carbohydrates', food.carbs, 'g', portion?.carbs],
    ['of which sugars', food.sugars, 'g', undefined],
    ['Fat', food.fat, 'g', portion?.fat],
    ['Fibre', food.fiber, 'g', undefined],
    ['Alcohol', food.alcohol, 'g', undefined],
    ['Sodium', food.sodium, 'mg', undefined],
  ];
  return (
    <div className="page">
      <PageHeader
        title={food.name}
        back="/nutrition/foods"
        subtitle={food.category}
        actions={
          <InfoButton title="Reference food">
            <p style={{ margin: 0 }}>Values per 100 g of the edible part, from the official Italian food composition tables.</p>
            <p style={{ margin: 0 }}>Source: {CREA_SOURCE}.</p>
            <p style={{ margin: 0 }}>Reference foods cannot be changed. In the Foods list, the copy icon makes your own editable copy.</p>
          </InfoButton>
        }
      />
      <div className="card">
        <table className="nutri-table">
          <thead>
            <tr>
              <th />
              <th>100 g</th>
              {food.portionG ? <th>{food.portionG} g</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(([, v]) => v !== undefined)
              .map(([label, v, unit, p]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    {round1(v ?? 0)} {unit}
                  </td>
                  {food.portionG ? <td>{p === undefined ? '' : `${round1(p)} ${unit}`}</td> : null}
                </tr>
              ))}
          </tbody>
        </table>
        {food.ediblePct !== undefined && food.ediblePct < 100 && <p className="small muted mt-s">Edible part: {food.ediblePct}%.</p>}
      </div>
      <p className="tiny faint">Source: {CREA_SOURCE}.</p>
    </div>
  );
}

function OwnFood({ initial, isNew }: { initial: Food; isNew: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<Food>(initial);
  const [saved, setSaved] = useState<Food | null>(isNew ? null : initial);
  useEffect(() => setF(initial), [initial]);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const set = (patch: Partial<Food>) => setF((cur) => ({ ...cur, ...patch }));
  const num = (key: 'kcal' | 'protein' | 'carbs' | 'fat') => (v: number | undefined) => set({ [key]: v ?? 0 });
  const photo = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  /** Photo waiting to be framed. */
  const [framing, setFraming] = useState<File | null>(null);

  const readPhoto = async (file: Blob | undefined) => {
    if (!file) return;
    setReading(true);
    setReadNote(null);
    try {
      const { values, name, brand } = await readLabelPhoto(file);
      const found = (Object.keys(values) as (keyof LabelValues)[]).filter((k) => values[k] !== undefined);
      // Name and brand only fill empty fields; the values replace what was typed.
      setF((cur) => ({ ...cur, ...values, name: cur.name.trim() ? cur.name : (name ?? cur.name), brand: cur.brand?.trim() ? cur.brand : (brand ?? cur.brand) }));
      setReadNote(
        found.length
          ? `Read from the photo: ${found.map((k) => LABEL_NAMES[k]).join(', ')}. Check the values against the label.`
          : 'No nutrition values were found in the photo. Frame the nutrition table and try again, or type the values.',
      );
    } catch (e) {
      setReadNote(e instanceof LabelError ? e.message : 'The photo could not be read. Try again, or type the values.');
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!f.name.trim()) return toast('Give the food a name');
    const next = { ...f, name: f.name.trim(), category: f.category.trim(), brand: f.brand?.trim() || undefined, updatedAt: Date.now() };
    await db.foods.put(next);
    setF(next);
    setSaved(next);
    toast('Food saved');
    if (isNew) navigate(`/nutrition/foods/${encodeURIComponent(next.id)}`, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader
        title={f.name || 'New food'}
        back="/nutrition/foods"
        confirmLeave={dirty}
        actions={
          <InfoButton title="Your food">
            <p style={{ margin: 0 }}>Values per 100 g (or 100 ml), as on the nutrition label. When Energy is empty, a button fills it from the macros.</p>
            <p style={{ margin: 0 }}>Read label photo: take or choose a photo of the nutrition table and frame the table; the values per 100 g fill the fields. The framed photo is sent to an AI service (Claude, by Anthropic) only to be read, and is not stored. Always check the values.</p>
            <p style={{ margin: 0 }}>Changes are kept only when you tap Save.</p>
          </InfoButton>
        }
      />
      <div className="stack">
        <label className="field">
          Name
          <input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          Brand
          <input value={f.brand ?? ''} onChange={(e) => set({ brand: e.target.value || undefined })} />
        </label>
        <label className="field">
          Category
          <input value={f.category} onChange={(e) => set({ category: e.target.value })} />
        </label>
        <label className="field">
          Barcode
          <input inputMode="numeric" value={f.barcode ?? ''} onChange={(e) => set({ barcode: e.target.value.replace(/\D/g, '') || undefined })} />
        </label>
        {f.origin === 'openfoodfacts' && (
          <p className="tiny faint" style={{ margin: 0 }}>
            Values from {OFF_SOURCE}. Check them against the label.
          </p>
        )}
        <div className="label-photo">
          <input
            ref={photo}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              setFraming(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <button className="btn" disabled={reading} onClick={() => photo.current?.click()}>
            <Icon name="camera" /> {reading ? 'Reading the label…' : 'Read label photo'}
          </button>
          {readNote && <p className="tiny faint" style={{ margin: 0 }}>{readNote}</p>}
        </div>
        <LabelCropper
          file={framing}
          onCancel={() => setFraming(null)}
          onCropped={(part) => {
            setFraming(null);
            void readPhoto(part);
          }}
        />
        <div className="nutri-grid">
          <NumberField label="Energy" suffix="kcal" value={f.kcal || undefined} onChange={num('kcal')} />
          <NumberField label="Protein" suffix="g" value={f.protein || undefined} onChange={num('protein')} />
          <NumberField label="Carbohydrates" suffix="g" value={f.carbs || undefined} onChange={num('carbs')} />
          <NumberField label="of which sugars" suffix="g" value={f.sugars} onChange={(v) => set({ sugars: v })} />
          <NumberField label="Fat" suffix="g" value={f.fat || undefined} onChange={num('fat')} />
          <NumberField label="of which saturated" suffix="g" value={f.saturatedFat} onChange={(v) => set({ saturatedFat: v })} />
          <NumberField label="Fibre" suffix="g" value={f.fiber} onChange={(v) => set({ fiber: v })} />
          <NumberField label="Sodium" suffix="mg" value={f.sodium} onChange={(v) => set({ sodium: v })} />
          <NumberField label="Portion" suffix="g" value={f.portionG} onChange={(v) => set({ portionG: v })} />
        </div>
        {!f.kcal && f.protein + f.carbs + f.fat > 0 && (
          <button className="btn small" onClick={() => set({ kcal: Math.round(f.protein * 4 + f.carbs * 4 + f.fat * 9) })}>
            Fill energy from the macros
          </button>
        )}
      </div>
      <div className="save-bar">
        <button className="big-btn" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
