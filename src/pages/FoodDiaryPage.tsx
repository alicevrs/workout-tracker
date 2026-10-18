import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FoodPicker } from '../components/FoodPicker';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/Library';
import { PageHeader, Sheet, useToast } from '../components/ui';
import { db } from '../db/db';
import type { DietPlan, Food, FoodEntry, PlanMeal } from '../db/types';
import { useFoods } from '../hooks/useFoods';
import { addDays, formatDate, fromDateKey, toDateKey } from '../lib/dates';
import { uid } from '../lib/ids';
import { activePlan, diaryMeals, entriesNutrients, entryNutrients, formatAmount, limitCounts, menuFor, planEntry, targetKcal, waterMl, weekDates } from '../lib/nutrition';

const WATER_STEP = 250;

/** The day's food diary: what was eaten, against the targets of the diet plan in force. */
export default function FoodDiaryPage() {
  const [params, setParams] = useSearchParams();
  const today = toDateKey(Date.now());
  const date = params.get('date') || today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });
  const toast = useToast();
  const { map: foods } = useFoods();
  const plans = useLiveQuery(() => db.dietPlans.toArray(), []);
  const week = weekDates(date);
  const weekEntries = useLiveQuery(() => db.foodEntries.where('date').between(week[0], week[6], true, true).toArray(), [week[0]]);
  const entries = (weekEntries ?? []).filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt);
  const plan = plans ? activePlan(plans, date) : undefined;
  const [fromPlan, setFromPlan] = useState<PlanMeal | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);

  const totals = entriesNutrients(entries, foods);
  const kcalTarget = plan ? targetKcal(plan.targets) : undefined;
  const water = waterMl(entries);
  const counts = limitCounts(weekEntries ?? []);

  const remove = (e: FoodEntry) => db.foodEntries.delete(e.id);
  const addFood = async (food: Food, grams?: number, isNew?: boolean) => {
    if (!addTo || !grams) return;
    const now = Date.now();
    // A scanned product joins the user's foods, so next time it is found without a connection.
    if (isNew) await db.foods.put({ ...food, updatedAt: now });
    await db.foodEntries.put({ id: uid(), date, kind: 'food', meal: addTo, name: food.name, foodId: food.id, grams, createdAt: now, updatedAt: now });
    setAddTo(null);
    toast('Added');
  };
  const addWater = async (dir: 1 | -1) => {
    const now = Date.now();
    if (dir === 1) return db.foodEntries.put({ id: uid(), date, kind: 'water', name: 'Water', ml: WATER_STEP, createdAt: now, updatedAt: now });
    const last = entries.filter((e) => e.kind === 'water').at(-1);
    if (last) await db.foodEntries.delete(last.id);
  };
  const count = async (limitId: string, name: string, dir: 1 | -1) => {
    const now = Date.now();
    if (dir === 1) return db.foodEntries.put({ id: uid(), date, kind: 'count', name, limitId, createdAt: now, updatedAt: now });
    const manual = (weekEntries ?? []).filter((e) => e.kind === 'count' && e.limitId === limitId).sort((a, b) => (a.date === date ? 1 : 0) - (b.date === date ? 1 : 0) || a.createdAt - b.createdAt);
    const last = manual.at(-1);
    if (last) await db.foodEntries.delete(last.id);
  };

  return (
    <div className="page">
      <PageHeader
        title="Food diary"
        back="/nutrition"
        subtitle={formatDate(fromDateKey(date).getTime())}
        actions={
          <InfoButton title="Food diary">
            <p style={{ margin: 0 }}>For each meal, “From plan” logs the options you chose from your diet plan; “Food” logs any food of the archive with its grams, or a packaged product by scanning its barcode.</p>
            <p style={{ margin: 0 }}>Calories and macros are added up against the targets of the plan in force on that day. Items without a linked food are listed but not counted.</p>
            <p style={{ margin: 0 }}>Weekly limits count the plan options marked for them; use + and − for anything eaten outside the plan.</p>
          </InfoButton>
        }
      />
      <div className="day-nav">
        <button className="btn icon ghost" aria-label="Previous day" onClick={() => setDate(toDateKey(addDays(fromDateKey(date).getTime(), -1)))}>
          <Icon name="back" />
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
        <button className="btn icon ghost" aria-label="Next day" onClick={() => setDate(toDateKey(addDays(fromDateKey(date).getTime(), 1)))}>
          <Icon name="forward" />
        </button>
        {date !== today && (
          <button className="btn small" onClick={() => setDate(today)}>
            Today
          </button>
        )}
      </div>
      <div className="stack">
        {plans && !plan && (
          <div className="banner info">
            <div style={{ flex: 1 }}>
              No diet plan in force on this day. <Link to="/nutrition/plans">Diet plans</Link>
            </div>
          </div>
        )}

        <section className="card">
          <h2 className="mb">Day</h2>
          <Bar label="Calories" value={totals.n.kcal} target={kcalTarget} unit="kcal" />
          <Bar label="Protein" value={totals.n.protein} target={plan?.targets.proteinG} unit="g" />
          <Bar label="Carbohydrates" value={totals.n.carbs} target={plan?.targets.carbsG} unit="g" />
          <Bar label="Fat" value={totals.n.fat} target={plan?.targets.fatG} unit="g" />
          <div className="water-row">
            <span>Water</span>
            <span className="grow-text">
              {Number((water / 1000).toFixed(2))} l{plan?.targets.waterL ? ` / ${plan.targets.waterL} l` : ''}
            </span>
            <button className="btn icon ghost small" aria-label="Remove a glass of water" disabled={water === 0} onClick={() => addWater(-1)}>
              <Icon name="minus" size={18} />
            </button>
            <button className="btn icon small" aria-label="Add a glass of water" onClick={() => addWater(1)}>
              <Icon name="plus" size={18} />
            </button>
          </div>
          {totals.partial && <p className="tiny faint" style={{ margin: '8px 0 0' }}>Some items have no linked food and are not counted.</p>}
        </section>

        {diaryMeals(plan, entries).map(({ name, meal }) => (
          <MealCard
            key={name}
            name={name}
            meal={meal}
            plan={plan}
            date={date}
            kcalTarget={kcalTarget && meal?.kcalPct ? Math.round((kcalTarget * meal.kcalPct) / 100) : undefined}
            entries={entries.filter((e) => e.meal === name && (e.kind === 'plan' || e.kind === 'food'))}
            foods={foods}
            onRemove={remove}
            onFromPlan={meal && meal.sections.some((s) => s.options.length) ? () => setFromPlan(meal) : undefined}
            onAddFood={() => setAddTo(name)}
          />
        ))}

        {plan && plan.limits.length > 0 && (
          <section className="card">
            <h2 className="mb">This week</h2>
            {plan.limits.map((l) => {
              const n = counts.get(l.id) ?? 0;
              const over = l.max !== undefined && n > l.max;
              const done = l.min !== undefined && n >= l.min;
              const manual = (weekEntries ?? []).some((e) => e.kind === 'count' && e.limitId === l.id);
              return (
                <div key={l.id} className="limit-count">
                  <span className="grow-text">{l.name}</span>
                  <span className={over ? 'delta-down' : done ? 'delta-up' : 'muted'}>
                    {n}
                    {l.max !== undefined ? ` / ${l.max}` : l.min !== undefined ? ` / ${l.min}` : ''}
                  </span>
                  <button className="btn icon ghost small" aria-label={`One less ${l.name}`} disabled={!manual} onClick={() => count(l.id, l.name, -1)}>
                    <Icon name="minus" size={18} />
                  </button>
                  <button className="btn icon small" aria-label={`One more ${l.name}`} onClick={() => count(l.id, l.name, 1)}>
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              );
            })}
            <p className="tiny faint" style={{ margin: '8px 0 0' }}>Times this week{plan.limits.some((l) => l.max !== undefined) ? ' / at most' : ''}{plan.limits.some((l) => l.max === undefined && l.min !== undefined) ? ' (or at least)' : ''}.</p>
          </section>
        )}

        {plan && plan.notes.some((n) => n.text.trim()) && (
          <section className="card">
            <h2 className="mb">Guidelines</h2>
            {plan.notes
              .filter((n) => n.text.trim())
              .map((n) => (
                <details key={n.id} className="menu-day">
                  <summary>{n.title || 'Guideline'}</summary>
                  <p className="small" style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>
                    {n.text}
                  </p>
                </details>
              ))}
          </section>
        )}
      </div>
      <FromPlanSheet meal={fromPlan} date={date} onClose={() => setFromPlan(null)} onAdded={() => toast('Added')} />
      <FoodPicker open={!!addTo} onClose={() => setAddTo(null)} onPick={addFood} withGrams scan title={addTo ? `Add to ${addTo}` : ''} />
    </div>
  );
}

function Bar({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = !!target && value > target * 1.05;
  return (
    <div className="nutri-bar">
      <div className="row between small">
        <span>{label}</span>
        <span className={over ? 'delta-down' : 'muted'}>
          {Math.round(value)}
          {target ? ` / ${Math.round(target)}` : ''} {unit}
        </span>
      </div>
      {target ? (
        <div className="nutri-track">
          <div className={`nutri-fill${over ? ' over' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function MealCard({
  name,
  meal,
  plan,
  date,
  kcalTarget,
  entries,
  foods,
  onRemove,
  onFromPlan,
  onAddFood,
}: {
  name: string;
  meal?: PlanMeal;
  plan?: DietPlan;
  date: string;
  kcalTarget?: number;
  entries: FoodEntry[];
  foods: Map<string, Food>;
  onRemove: (e: FoodEntry) => void;
  onFromPlan?: () => void;
  onAddFood: () => void;
}) {
  const menu = plan && meal ? menuFor(plan, date, meal.id) : undefined;
  const kcal = entries.reduce((s, e) => s + entryNutrients(e, foods).n.kcal, 0);
  return (
    <section className="card">
      <div className="row between">
        <h2>{name}</h2>
        <span className="small muted">
          {entries.length ? `${Math.round(kcal)}` : ''}
          {kcalTarget ? `${entries.length ? ' / ' : '≈ '}${kcalTarget} kcal` : entries.length ? ' kcal' : ''}
        </span>
      </div>
      {menu && <p className="small muted menu-line">{menu}</p>}
      {entries.length > 0 && (
        <ul className="diary-list">
          {entries.map((e) => {
            const t = entryNutrients(e, foods);
            return (
              <li key={e.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {e.section && e.section !== e.name && <span className="faint">{e.section}: </span>}
                    {e.name}
                    {e.kind === 'food' && <span className="faint"> · {e.grams} g</span>}
                  </div>
                  {e.kind === 'plan' && e.items && e.items.length > 0 && (
                    <div className="tiny faint">{e.items.map((it) => [it.name, formatAmount(it)].filter(Boolean).join(' ')).join(', ')}</div>
                  )}
                </div>
                <span className="small muted" style={{ flexShrink: 0 }}>
                  {t.n.kcal > 0 ? `${Math.round(t.n.kcal)} kcal` : ''}
                </span>
                <button className="btn icon ghost small" aria-label={`Remove ${e.name}`} onClick={() => onRemove(e)}>
                  <Icon name="x" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="row mt-s">
        {onFromPlan && (
          <button className="btn small primary" onClick={onFromPlan}>
            <Icon name="list" /> From plan
          </button>
        )}
        <button className="btn small" onClick={onAddFood}>
          <Icon name="plus" /> Food
        </button>
      </div>
    </section>
  );
}

/** Pick one option per part of a plan meal and log them. */
function FromPlanSheet({ meal, date, onClose, onAdded }: { meal: PlanMeal | null; date: string; onClose: () => void; onAdded: () => void }) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  useEffect(() => {
    // Parts with a single option are chosen already.
    setChosen(meal ? Object.fromEntries(meal.sections.filter((s) => s.options.length === 1).map((s) => [s.id, s.options[0].id])) : {});
  }, [meal]);
  if (!meal) return null;
  const add = async () => {
    const now = Date.now();
    const rows = meal.sections.flatMap((s, i) => {
      const o = s.options.find((x) => x.id === chosen[s.id]);
      return o ? [planEntry(date, meal.name, s.name, o, now + i)] : [];
    });
    if (!rows.length) return;
    await db.foodEntries.bulkPut(rows);
    onAdded();
    onClose();
  };
  const any = meal.sections.some((s) => chosen[s.id]);
  return (
    <Sheet open onClose={onClose} title={meal.name}>
      <div className="stack">
        {meal.sections
          .filter((s) => s.options.length)
          .map((s) => (
            <div key={s.id} className="stack">
              {s.name && <h3 className="small muted" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.name}</h3>}
              {s.options.map((o) => {
                const on = chosen[s.id] === o.id;
                return (
                  <button key={o.id} className={`option-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setChosen({ ...chosen, [s.id]: on ? '' : o.id })}>
                    <strong>{o.name || 'Option'}</strong>
                    {o.items.length > 0 && <span className="tiny">{o.items.map((it) => [it.name, formatAmount(it)].filter(Boolean).join(' ')).join(', ')}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        <div className="save-bar" style={{ paddingTop: 8 }}>
          <button className="big-btn" disabled={!any} onClick={add}>
            Add
          </button>
        </div>
      </div>
    </Sheet>
  );
}
