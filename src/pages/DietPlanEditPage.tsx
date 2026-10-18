import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { FoodPicker } from '../components/FoodPicker';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/Library';
import { EmptyState, NumberField, PageHeader, Segmented, useToast } from '../components/ui';
import { db } from '../db/db';
import type { DailyTargets, DietPlan, Food, PlanItem, PlanMeal, PlanNote, PlanOption, PlanSection, PortionUnit, WeeklyLimit } from '../db/types';
import { useFoods } from '../hooks/useFoods';
import { useDraft } from '../lib/drafts';
import { uid } from '../lib/ids';
import { gramsFromPercent, itemsNutrients, macroPercents, newMeal, targetKcal, UNIT_LABEL } from '../lib/nutrition';

const UNITS: PortionUnit[] = ['g', 'ml', 'piece', 'tbsp', 'tsp', 'to_taste'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Create or edit a diet plan. Nothing is stored until Save. */
export default function DietPlanEditPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { map: foods } = useFoods();
  const { item: plan, setItem, current, dirty, markSaved } = useDraft<DietPlan>(`plan:${id}`, () => db.dietPlans.get(id));
  /** Item waiting for a food from the picker: [meal id, section id, option id, item id]. */
  const [linking, setLinking] = useState<[string, string, string, string] | null>(null);

  if (plan === undefined) return <div className="page" />;
  if (plan === null)
    return (
      <div className="page">
        <PageHeader title="Diet plan" back="/nutrition/plans" />
        <EmptyState title="Diet plan not found" />
      </div>
    );

  const update = (patch: Partial<DietPlan>) => {
    const cur = current();
    if (cur) setItem({ ...cur, ...patch });
  };
  const setMeals = (meals: PlanMeal[]) => update({ meals });
  const setMeal = (mid: string, patch: Partial<PlanMeal>) => setMeals(plan.meals.map((m) => (m.id === mid ? { ...m, ...patch } : m)));
  const setSection = (mid: string, sid: string, patch: Partial<PlanSection>) =>
    setMeal(mid, { sections: plan.meals.find((m) => m.id === mid)!.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  const sectionOf = (mid: string, sid: string) => plan.meals.find((m) => m.id === mid)!.sections.find((s) => s.id === sid)!;
  const setOption = (mid: string, sid: string, oid: string, patch: Partial<PlanOption>) =>
    setSection(mid, sid, { options: sectionOf(mid, sid).options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) });
  const optionOf = (mid: string, sid: string, oid: string) => sectionOf(mid, sid).options.find((o) => o.id === oid)!;
  const setItemOf = (mid: string, sid: string, oid: string, iid: string, patch: Partial<PlanItem>) =>
    setOption(mid, sid, oid, { items: optionOf(mid, sid, oid).items.map((it) => (it.id === iid ? { ...it, ...patch } : it)) });

  const onFood = (food: Food) => {
    if (!linking) return;
    const [mid, sid, oid, iid] = linking;
    const it = optionOf(mid, sid, oid).items.find((x) => x.id === iid);
    setItemOf(mid, sid, oid, iid, { foodId: food.id, name: it?.name.trim() ? it.name : food.name });
    setLinking(null);
  };

  const save = async () => {
    if (!plan.startDate) return toast('Choose the start date');
    const next = { ...plan, name: plan.name.trim() || 'Diet plan', menu: plan.menu.filter((c) => c.text.trim() && c.week < plan.menuWeeks), updatedAt: Date.now() };
    await db.dietPlans.put(next);
    markSaved(next);
    toast('Diet plan saved');
  };

  return (
    <div className="page">
      <PageHeader
        title={plan.name || 'Diet plan'}
        back="/nutrition/plans"
        confirmLeave={dirty}
        actions={
          <InfoButton title="Diet plan">
            <p style={{ margin: 0 }}>
              <strong>Targets</strong>: daily calories and macros, in grams or as a share of the calories.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Meals</strong>: each meal has one or more parts; in the food diary one option is chosen for each part. Link a food of the archive to an item to count its calories.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Weekly limits</strong>: how many times a week something may or should be eaten. Mark the options that count towards a limit.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Menu</strong>: what to eat on each day, over one or more weeks that repeat in turn. <strong>Guidelines</strong>: free text.
            </p>
            <p style={{ margin: 0 }}>Changes are kept only when you tap Save.</p>
          </InfoButton>
        }
      />
      <div className="stack">
        <label className="field">
          Name
          <input value={plan.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label className="field">
          In force from
          <input type="date" value={plan.startDate} onChange={(e) => update({ startDate: e.target.value })} />
        </label>

        <TargetsCard targets={plan.targets} onChange={(targets) => update({ targets })} />

        <h2 className="plan-heading">Meals</h2>
        {plan.meals.map((meal, mi) => (
          <details key={meal.id} className="plan-card" open={plan.meals.length <= 1 || undefined}>
            <summary>
              <span className="plan-card-title">{meal.name || 'Meal'}</span>
              {meal.kcalPct ? <span className="tiny faint">{meal.kcalPct}%</span> : null}
            </summary>
            <div className="stack plan-card-body">
              <div className="row">
                <label className="field" style={{ flex: 1 }}>
                  Meal
                  <input value={meal.name} onChange={(e) => setMeal(meal.id, { name: e.target.value })} />
                </label>
                <div style={{ width: 96 }}>
                  <NumberField label="Calories" suffix="%" value={meal.kcalPct} onChange={(v) => setMeal(meal.id, { kcalPct: v })} />
                </div>
              </div>
              {meal.sections.map((sec) => (
                <div key={sec.id} className="plan-section">
                  <div className="row">
                    <label className="field" style={{ flex: 1 }}>
                      Part
                      <input value={sec.name} onChange={(e) => setSection(meal.id, sec.id, { name: e.target.value })} />
                    </label>
                    <button
                      className="btn icon ghost"
                      aria-label="Remove part"
                      onClick={() => (sec.options.length === 0 || confirm('Remove this part and its options?')) && setMeal(meal.id, { sections: meal.sections.filter((s) => s.id !== sec.id) })}
                    >
                      <Icon name="x" size={18} />
                    </button>
                  </div>
                  <p className="tiny faint" style={{ margin: 0 }}>
                    {sec.options.length > 1 ? 'One of these options is chosen.' : sec.options.length === 1 ? 'Add more options to give a choice.' : 'No options yet.'}
                  </p>
                  {sec.options.map((opt, oi) => {
                    const t = itemsNutrients(opt.items, foods);
                    return (
                      <div key={opt.id} className="plan-option">
                        <div className="row">
                          <input className="plan-option-name" value={opt.name} onChange={(e) => setOption(meal.id, sec.id, opt.id, { name: e.target.value })} aria-label="Option name" placeholder="Option name" />
                          <button className="btn icon ghost small" aria-label="Move option up" disabled={oi === 0} onClick={() => setSection(meal.id, sec.id, { options: move(sec.options, oi, -1) })}>
                            <Icon name="up" size={18} />
                          </button>
                          <button
                            className="btn icon ghost small"
                            aria-label="Remove option"
                            onClick={() => (opt.items.length === 0 || confirm(`Remove “${opt.name || 'this option'}”?`)) && setSection(meal.id, sec.id, { options: sec.options.filter((o) => o.id !== opt.id) })}
                          >
                            <Icon name="x" size={18} />
                          </button>
                        </div>
                        {opt.items.map((it) => (
                          <ItemRow
                            key={it.id}
                            item={it}
                            food={it.foodId ? foods.get(it.foodId) : undefined}
                            onChange={(patch) => setItemOf(meal.id, sec.id, opt.id, it.id, patch)}
                            onRemove={() => setOption(meal.id, sec.id, opt.id, { items: opt.items.filter((x) => x.id !== it.id) })}
                            onLink={() => setLinking([meal.id, sec.id, opt.id, it.id])}
                          />
                        ))}
                        <button className="btn small ghost" onClick={() => setOption(meal.id, sec.id, opt.id, { items: [...opt.items, { id: uid(), name: '', unit: 'g' }] })}>
                          <Icon name="plus" /> Food
                        </button>
                        {plan.limits.length > 0 && <span className="tiny faint">Counts towards</span>}
                        {plan.limits.length > 0 && (
                          <div className="chips" role="group" aria-label="Counts towards">
                            {plan.limits.map((l) => {
                              const on = !!opt.limitIds?.includes(l.id);
                              return (
                                <button
                                  key={l.id}
                                  className="chip"
                                  aria-pressed={on}
                                  onClick={() => setOption(meal.id, sec.id, opt.id, { limitIds: on ? opt.limitIds!.filter((x) => x !== l.id) : [...(opt.limitIds ?? []), l.id] })}
                                >
                                  {l.name || 'Limit'}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {t.n.kcal > 0 && (
                          <p className="tiny faint" style={{ margin: 0 }}>
                            ≈ {Math.round(t.n.kcal)} kcal · P {Math.round(t.n.protein)} · C {Math.round(t.n.carbs)} · F {Math.round(t.n.fat)}
                            {t.partial ? ' (some foods not counted)' : ''}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <button className="btn small" onClick={() => setSection(meal.id, sec.id, { options: [...sec.options, { id: uid(), name: '', items: [] }] })}>
                    <Icon name="plus" /> Option
                  </button>
                </div>
              ))}
              <div className="row wrap">
                <button className="btn small" onClick={() => setMeal(meal.id, { sections: [...meal.sections, { id: uid(), name: '', options: [] }] })}>
                  <Icon name="plus" /> Part
                </button>
                <span style={{ flex: 1 }} />
                <button className="btn icon ghost small" aria-label="Move meal up" disabled={mi === 0} onClick={() => setMeals(move(plan.meals, mi, -1))}>
                  <Icon name="up" size={18} />
                </button>
                <button className="btn icon ghost small" aria-label="Move meal down" disabled={mi === plan.meals.length - 1} onClick={() => setMeals(move(plan.meals, mi, 1))}>
                  <Icon name="down" size={18} />
                </button>
                <button className="btn icon ghost small" aria-label="Remove meal" onClick={() => confirm(`Remove “${meal.name || 'this meal'}”?`) && setMeals(plan.meals.filter((m) => m.id !== meal.id))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
          </details>
        ))}
        <button className="btn small" onClick={() => setMeals([...plan.meals, newMeal('')])}>
          <Icon name="plus" /> Meal
        </button>

        <LimitsCard limits={plan.limits} onChange={(limits) => update({ limits })} />
        <MenuCard plan={plan} onChange={update} />
        <NotesCard notes={plan.notes} onChange={(notes) => update({ notes })} />
      </div>
      <div className="save-bar">
        <button className="big-btn" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
      <FoodPicker open={!!linking} onClose={() => setLinking(null)} onPick={onFood} title="Link a food" />
    </div>
  );
}

function TargetsCard({ targets, onChange }: { targets: DailyTargets; onChange: (t: DailyTargets) => void }) {
  const [mode, setMode] = useState<'g' | 'pct'>('g');
  const kcal = targetKcal(targets);
  const pct = macroPercents(targets);
  const set = (patch: Partial<DailyTargets>) => onChange({ ...targets, ...patch });
  const macro = (label: string, key: 'proteinG' | 'carbsG' | 'fatG', pkey: 'protein' | 'carbs' | 'fat', perG: number) =>
    mode === 'g' ? (
      <NumberField label={label} suffix="g" value={targets[key]} onChange={(v) => set({ [key]: v })} />
    ) : (
      <NumberField
        label={label}
        suffix="%"
        value={pct[pkey]}
        disabled={!targets.kcal}
        onChange={(v) => set({ [key]: v === undefined || !targets.kcal ? undefined : gramsFromPercent(targets.kcal, v, perG) })}
      />
    );
  return (
    <section className="card">
      <h2 className="mb">Daily targets</h2>
      <div className="stack">
        <NumberField label="Calories" suffix="kcal" value={targets.kcal} onChange={(v) => set({ kcal: v })} />
        <Segmented
          label="Macros in"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'g', label: 'Grams' },
            { value: 'pct', label: '% of calories' },
          ]}
        />
        {mode === 'pct' && !targets.kcal && <p className="tiny faint" style={{ margin: 0 }}>Set the calories first.</p>}
        <div className="nutri-grid">
          {macro('Protein', 'proteinG', 'protein', 4)}
          {macro('Carbohydrates', 'carbsG', 'carbs', 4)}
          {macro('Fat', 'fatG', 'fat', 9)}
          <NumberField label="Water" suffix="l" value={targets.waterL} onChange={(v) => set({ waterL: v })} />
        </div>
        {(targets.proteinG || targets.carbsG || targets.fatG) && kcal ? (
          <p className="tiny faint" style={{ margin: 0 }}>
            {mode === 'g'
              ? `Protein ${pct.protein ?? 0}% · Carbohydrates ${pct.carbs ?? 0}% · Fat ${pct.fat ?? 0}% of ${Math.round(kcal)} kcal`
              : `Protein ${targets.proteinG ?? 0} g · Carbohydrates ${targets.carbsG ?? 0} g · Fat ${targets.fatG ?? 0} g`}
            {!targets.kcal ? ' (calories from the macros)' : ''}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ItemRow({ item, food, onChange, onRemove, onLink }: { item: PlanItem; food?: Food; onChange: (p: Partial<PlanItem>) => void; onRemove: () => void; onLink: () => void }) {
  const spoon = item.unit === 'piece' || item.unit === 'tbsp' || item.unit === 'tsp';
  return (
    <div className="plan-item">
      <div className="row">
        <input className="plan-item-name" value={item.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Food" placeholder="Food" />
        <button className="btn icon ghost small" onClick={onRemove} aria-label={`Remove ${item.name || 'food'}`}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="plan-item-amounts">
        {item.unit !== 'to_taste' && (
          <>
            <NumberField label="Amount" hideLabel value={item.amount} onChange={(v) => onChange({ amount: v })} />
            <span className="faint">–</span>
            <NumberField label="Up to" hideLabel placeholder="max" value={item.amountMax} onChange={(v) => onChange({ amountMax: v })} />
          </>
        )}
        <select value={item.unit} onChange={(e) => onChange({ unit: e.target.value as PortionUnit })} aria-label="Unit">
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
        {spoon && (
          <NumberField
            label={`Grams per ${UNIT_LABEL[item.unit]}`}
            hideLabel
            placeholder={item.unit === 'piece' ? 'g each' : item.unit === 'tbsp' ? '10 g' : '5 g'}
            value={item.gramsPerUnit}
            onChange={(v) => onChange({ gramsPerUnit: v })}
          />
        )}
      </div>
      <button className={`plan-link${food ? ' linked' : ''}`} onClick={food ? () => onChange({ foodId: undefined }) : onLink}>
        <Icon name="link" size={14} /> {food ? `${food.name} · ${Math.round(food.kcal)} kcal/100 g` : 'Link a food to count calories'}
        {food && <Icon name="x" size={14} />}
      </button>
    </div>
  );
}

function LimitsCard({ limits, onChange }: { limits: WeeklyLimit[]; onChange: (l: WeeklyLimit[]) => void }) {
  const set = (id: string, patch: Partial<WeeklyLimit>) => onChange(limits.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <section className="card">
      <h2 className="mb">Weekly limits</h2>
      <div className="stack">
        {limits.map((l) => (
          <div key={l.id} className="limit-row">
            <input value={l.name} onChange={(e) => set(l.id, { name: e.target.value })} aria-label="Limit name" placeholder="Name" />
            <NumberField label="At least" hideLabel placeholder="min" value={l.min} onChange={(v) => set(l.id, { min: v })} inputMode="numeric" />
            <NumberField label="At most" hideLabel placeholder="max" value={l.max} onChange={(v) => set(l.id, { max: v })} inputMode="numeric" />
            <button className="btn icon ghost small" aria-label={`Remove ${l.name || 'limit'}`} onClick={() => onChange(limits.filter((x) => x.id !== l.id))}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
        {limits.length > 0 && <p className="tiny faint" style={{ margin: 0 }}>Times a week: at least · at most.</p>}
        <button className="btn small" onClick={() => onChange([...limits, { id: uid(), name: '' }])}>
          <Icon name="plus" /> Limit
        </button>
      </div>
    </section>
  );
}

function MenuCard({ plan, onChange }: { plan: DietPlan; onChange: (p: Partial<DietPlan>) => void }) {
  const [week, setWeek] = useState(0);
  const w = Math.min(week, plan.menuWeeks - 1);
  const text = (day: number, mealId: string) => plan.menu.find((c) => c.week === w && c.day === day && c.mealId === mealId)?.text ?? '';
  const setText = (day: number, mealId: string, value: string) =>
    onChange({ menu: [...plan.menu.filter((c) => !(c.week === w && c.day === day && c.mealId === mealId)), ...(value ? [{ week: w, day, mealId, text: value }] : [])] });
  return (
    <section className="card">
      <h2 className="mb">Menu</h2>
      <div className="stack">
        <NumberField label="Weeks" value={plan.menuWeeks} min={1} max={4} stepper inputMode="numeric" onChange={(v) => onChange({ menuWeeks: Math.max(1, Math.min(4, v ?? 1)) })} />
        {plan.menuWeeks > 1 && (
          <Segmented
            label="Week"
            value={String(w)}
            onChange={(v) => setWeek(Number(v))}
            options={Array.from({ length: plan.menuWeeks }, (_, i) => ({ value: String(i), label: `Week ${i + 1}` }))}
          />
        )}
        {DAYS.map((d, di) => {
          const filled = plan.meals.filter((m) => text(di, m.id)).length;
          return (
            <details key={d} className="menu-day">
              <summary>
                {d}
                {filled > 0 && <Icon name="check" size={16} />}
              </summary>
              <div className="stack">
                {plan.meals.map((m) => (
                  <label key={m.id} className="field">
                    {m.name || 'Meal'}
                    <textarea rows={2} value={text(di, m.id)} onChange={(e) => setText(di, m.id, e.target.value)} />
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function NotesCard({ notes, onChange }: { notes: PlanNote[]; onChange: (n: PlanNote[]) => void }) {
  const set = (id: string, patch: Partial<PlanNote>) => onChange(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  return (
    <section className="card">
      <h2 className="mb">Guidelines</h2>
      <div className="stack">
        {notes.map((n, i) => (
          <div key={n.id} className="stack">
            <div className="row">
              <input style={{ flex: 1 }} value={n.title} onChange={(e) => set(n.id, { title: e.target.value })} aria-label="Title" placeholder="Title" />
              <button className="btn icon ghost small" aria-label="Move up" disabled={i === 0} onClick={() => onChange(move(notes, i, -1))}>
                <Icon name="up" size={18} />
              </button>
              <button className="btn icon ghost small" aria-label={`Remove ${n.title || 'guideline'}`} onClick={() => (!n.text || confirm('Remove this guideline?')) && onChange(notes.filter((x) => x.id !== n.id))}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <textarea rows={4} value={n.text} onChange={(e) => set(n.id, { text: e.target.value })} aria-label={`${n.title || 'Guideline'} text`} />
          </div>
        ))}
        <button className="btn small" onClick={() => onChange([...notes, { id: uid(), title: '', text: '' }])}>
          <Icon name="plus" /> Guideline
        </button>
      </div>
    </section>
  );
}
