import { saveProfile, useProfile } from '../db/repo';
import type { Sex, WeightUnit } from '../db/types';
import { ageFromBirthDate } from '../lib/dates';
import { fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { NumberField, Segmented } from './ui';

export function ProfileForm() {
  const p = useProfile();
  const age = p.birthDate ? ageFromBirthDate(p.birthDate) : p.age;
  return (
    <div className="form-grid">
      <div className="full">
        <div className="small muted mb" style={{ marginBottom: 6, fontWeight: 600 }}>
          Sex (used for the BMR formula)
        </div>
        <Segmented<Sex>
          label="Sex"
          value={p.sex}
          onChange={(sex) => saveProfile({ sex })}
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
            { value: 'unspecified', label: 'Not set' },
          ]}
        />
      </div>
      <label className="field">
        Birth date
        <input type="date" value={p.birthDate ?? ''} onChange={(e) => saveProfile({ birthDate: e.target.value || undefined })} />
      </label>
      <NumberField label="Age" value={age} onChange={(v) => saveProfile({ age: v, birthDate: undefined })} inputMode="numeric" suffix={p.birthDate ? 'from birth date' : undefined} />
      <NumberField label="Height" suffix="cm" value={p.heightCm} onChange={(v) => saveProfile({ heightCm: v })} />
      <NumberField
        label="Body weight"
        suffix={`${p.unit}, fallback when no weight log entry`}
        value={toDisplayWeight(p.weightKg, p.unit)}
        onChange={(v) => saveProfile({ weightKg: fromDisplayWeight(v, p.unit) })}
      />
      <div className="full">
        <div className="small muted" style={{ marginBottom: 6, fontWeight: 600 }}>
          Weight unit
        </div>
        <Segmented<WeightUnit>
          label="Weight unit"
          value={p.unit}
          onChange={(unit) => saveProfile({ unit })}
          options={[
            { value: 'kg', label: 'Kilograms (kg)' },
            { value: 'lb', label: 'Pounds (lb)' },
          ]}
        />
      </div>
      <NumberField label="Default rest" suffix="seconds" value={p.defaultRestSec} onChange={(v) => saveProfile({ defaultRestSec: v ?? 90 })} step={15} stepper inputMode="numeric" />
      <NumberField label="Get-ready countdown" suffix="seconds" value={p.defaultPrepSec} onChange={(v) => saveProfile({ defaultPrepSec: v ?? 10 })} step={5} stepper inputMode="numeric" />
    </div>
  );
}
