import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList } from '../components/Library';
import { PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import { formatDate, fromDateKey, toDateKey } from '../lib/dates';
import { setDraft } from '../lib/drafts';
import { activePlan, duplicatePlan, newPlan } from '../lib/nutrition';

/** Diet plans: each one is in force from its start date until the next one starts. */
export default function DietPlansPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const plans = useLiveQuery(() => db.dietPlans.orderBy('startDate').reverse().toArray(), []);
  const inUse = plans ? activePlan(plans, toDateKey(Date.now())) : undefined;

  const create = () => {
    const p = newPlan();
    setDraft(`plan:${p.id}`, p, true); // stored only when saved
    navigate(`/nutrition/plans/${p.id}?draft=1`);
  };
  const duplicate = async (id: string) => {
    const p = await db.dietPlans.get(id);
    if (!p) return;
    const copy = duplicatePlan(p);
    setDraft(`plan:${copy.id}`, copy, true);
    navigate(`/nutrition/plans/${copy.id}?draft=1`);
  };
  const remove = async (id: string) => {
    const p = await db.dietPlans.get(id);
    if (!p || !confirm(`Delete “${p.name}”? The food diary keeps what was logged.`)) return;
    await db.dietPlans.delete(id);
    toast('Diet plan deleted');
  };

  return (
    <div className="page">
      <PageHeader
        title="Diet plans"
        back="/nutrition"
        actions={
          <InfoButton title="Diet plans">
            <p style={{ margin: 0 }}>A diet plan holds the daily targets (calories, protein, carbohydrates, fat, water), the meals with the choices for each one, the weekly limits, a suggested menu and the guidelines.</p>
            <p style={{ margin: 0 }}>Each plan is in force from its start date until the next plan starts, so older plans stay as a record. After a visit, duplicate the current plan (copy icon), change what is new and set the new start date.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <button className="big-btn" onClick={create}>
          <Icon name="plus" /> New diet plan
        </button>
      </div>
      <div className="stack">
        <LibraryList
          items={(plans ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            sub: `From ${formatDate(fromDateKey(p.startDate).getTime())}`,
            badge: p.id === inUse?.id ? 'In use' : undefined,
            to: `/nutrition/plans/${p.id}`,
          }))}
          onDuplicate={duplicate}
          onDelete={remove}
          empty="No diet plans yet."
        />
      </div>
    </div>
  );
}
