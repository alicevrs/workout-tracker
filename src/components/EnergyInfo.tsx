import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useProfile } from '../db/repo';
import { ageOn, bmrMifflin, MET_TABLE, weightOn } from '../lib/calories';
import { toDateKey } from '../lib/dates';

export function EnergyInfo() {
  const profile = useProfile();
  const weights = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? [];
  const now = Date.now();
  const kg = weightOn(toDateKey(now), weights, profile);
  const bmr = bmrMifflin(profile.sex, kg, profile.heightCm, ageOn(profile, now));
  return (
    <div className="stack">
      <div className="banner info">
        <div className="grow">
          {bmr ? (
            <>
              Your estimated basal metabolic rate (BMR) is <strong>{Math.round(bmr)} kcal/day</strong> (Mifflin-St Jeor
              {profile.sex === 'unspecified' ? ', sex not set: average constant' : ''}).
            </>
          ) : (
            'Add sex, birth date or age, height and weight above to see your BMR.'
          )}
        </div>
      </div>
      <p className="small muted">
        Workout calories use the MET method: <strong>kcal = MET × body weight (kg) × hours</strong>. The MET depends on the block type and the effort you choose for each workout.
        Values are approximate, based on the Compendium of Physical Activities. Calories imported from Garmin or Strava replace the estimate and are marked “Imported”.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Light</th>
            <th>Moderate</th>
            <th>Vigorous</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(MET_TABLE).map((m) => (
            <tr key={m.label}>
              <td>{m.label}</td>
              <td>{m.light}</td>
              <td>{m.moderate}</td>
              <td>{m.vigorous}</td>
            </tr>
          ))}
          <tr>
            <td>Cardio exercises</td>
            <td colSpan={3} style={{ textAlign: 'right' }}>
              per exercise (e.g. running 9.8), × 0.75 light / × 1.3 vigorous
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
