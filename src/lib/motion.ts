// Stylised exercise animations: a stick figure in side view (facing right) that moves between two
// poses, with simple equipment. Drawn by components/ExerciseAnimation.tsx.
//
// Angles are in degrees, absolute: 0 = pointing down, 90 = forward (right), 180 = up, -90 = back.
// The torso angle is measured from the hips to the neck: 0 = upright, 90 = leaning fully forward
// (head to the right), -90 = lying with the head to the left. Arm angles can be relative to the
// torso (`armRel`), which is easier for lying poses.

export type Ang2 = [number, number];

export interface Pose {
  torso: number;
  /** Upper arm, forearm (near side). */
  arm: Ang2;
  /** Far arm; defaults to the near arm. */
  arm2?: Ang2;
  /** Thigh, shin (near side). */
  leg: Ang2;
  leg2?: Ang2;
  armRel?: boolean;
  /** Head tilt relative to the torso (nods). */
  head?: number;
  /** Shoulders lifted (shrugs), in px. */
  shrug?: number;
  /** Put this joint at this point (the rest of the body follows). */
  pin: { joint: Joint; at: [number, number] };
}

export type Joint = 'foot' | 'foot2' | 'hand' | 'hand2' | 'hip' | 'knee' | 'knee2' | 'neck';

export type Prop =
  | { kind: 'barbell' | 'dumbbell' | 'kettlebell' | 'ball' | 'plate'; at: 'hand' | 'neck' | 'hip' | 'foot' }
  | { kind: 'bench'; x: number; y: number; w: number; h?: number; angle?: number }
  | { kind: 'bar'; y: number; x?: number; w?: number }
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'cable'; from: [number, number]; to?: 'hand' | 'foot' }
  | { kind: 'wall'; x: number }
  | { kind: 'line'; from: [number, number]; to: [number, number] }
  | { kind: 'wheel'; at: [number, number]; r: number };

export interface Motion {
  a: Pose;
  /** Second pose; missing = a still pose (holds and stretches). */
  b?: Pose;
  props?: Prop[];
  /** Seconds for a full A → B → A cycle. */
  dur?: number;
  /** Front view (for side-to-side movements): see `FrontPose`. */
  front?: { a: FrontPose; b?: FrontPose; props?: Prop[] };
}

/** Front view: arms and legs opened sideways by these angles (0 = down). */
export interface FrontPose {
  arms: number;
  legs: number;
  /** Seated (thighs towards the viewer, drawn short). */
  seated?: boolean;
  /** Hop height in px. */
  lift?: number;
}

export const FLOOR = 178;
const L = { torso: 48, head: 15, upper: 26, fore: 24, thigh: 34, shin: 34, foot: 9 };

const rad = (d: number) => (d * Math.PI) / 180;
const step = (p: [number, number], len: number, ang: number): [number, number] => [p[0] + len * Math.sin(rad(ang)), p[1] + len * Math.cos(rad(ang))];

export interface Skeleton {
  hip: [number, number];
  neck: [number, number];
  head: [number, number];
  elbow: [number, number];
  hand: [number, number];
  elbow2: [number, number];
  hand2: [number, number];
  knee: [number, number];
  ankle: [number, number];
  toe: [number, number];
  knee2: [number, number];
  ankle2: [number, number];
  toe2: [number, number];
}

/** Joint positions of a pose. */
export function skeleton(p: Pose): Skeleton {
  const raw = (): Skeleton => {
    const hip: [number, number] = [0, 0];
    const up = 180 - p.torso; // from the hips towards the head
    const neck0 = step(hip, L.torso, up);
    const neck: [number, number] = [neck0[0], neck0[1] - (p.shrug ?? 0)];
    const head = step(neck, L.head, up - (p.head ?? 0));
    // Relative arm angles turn with the body: 0 = along the body towards the hips.
    const rel = (a: number) => (p.armRel ? a - p.torso : a);
    const arm = (s: Ang2) => {
      const elbow = step(neck, L.upper, rel(s[0]));
      return [elbow, step(elbow, L.fore, rel(s[1]))] as const;
    };
    const leg = (s: Ang2) => {
      const knee = step(hip, L.thigh, s[0]);
      const ankle = step(knee, L.shin, s[1]);
      const toe: [number, number] = [ankle[0] + L.foot * Math.cos(rad(s[1])), ankle[1] - L.foot * Math.sin(rad(s[1]))];
      return [knee, ankle, toe] as const;
    };
    const [elbow, hand] = arm(p.arm);
    const [elbow2, hand2] = arm(p.arm2 ?? p.arm);
    const [knee, ankle, toe] = leg(p.leg);
    const [knee2, ankle2, toe2] = leg(p.leg2 ?? p.leg);
    return { hip, neck, head, elbow, hand, elbow2, hand2, knee, ankle, toe, knee2, ankle2, toe2 };
  };
  const s = raw();
  const where: Record<Joint, [number, number]> = { foot: s.ankle, foot2: s.ankle2, hand: s.hand, hand2: s.hand2, hip: s.hip, knee: s.knee, knee2: s.knee2, neck: s.neck };
  const from = where[p.pin.joint];
  const dx = p.pin.at[0] - from[0];
  const dy = p.pin.at[1] - from[1];
  const out = {} as Skeleton;
  for (const k of Object.keys(s) as (keyof Skeleton)[]) out[k] = [Math.round((s[k][0] + dx) * 10) / 10, Math.round((s[k][1] + dy) * 10) / 10];
  return out;
}

// ---------- pose helpers ----------

const FOOT: [number, number] = [96, FLOOR - 3];
const onFeet = (x = FOOT[0]) => ({ joint: 'foot' as const, at: [x, FOOT[1]] as [number, number] });
const atHip = (x: number, y: number) => ({ joint: 'hip' as const, at: [x, y] as [number, number] });
const atHand = (x: number, y: number) => ({ joint: 'hand' as const, at: [x, y] as [number, number] });

function stand(arm: Ang2 = [0, 0], extra: Partial<Pose> = {}): Pose {
  return { torso: 0, arm, leg: [0, 0], pin: onFeet(), ...extra };
}
function seated(arm: Ang2 = [0, 0], extra: Partial<Pose> = {}): Pose {
  return { torso: 0, arm, leg: [90, 0], pin: atHip(80, 118), ...extra };
}
/** Lying on the back on a bench, head to the left. */
function benchLie(arm: Ang2, extra: Partial<Pose> = {}): Pose {
  return { torso: -90, arm, leg: [72, 0], pin: atHip(120, 132), ...extra };
}
/** Lying on the back on the floor, head to the left. */
function floorLie(extra: Partial<Pose>): Pose {
  return { torso: -90, arm: [180, 180], leg: [90, 90], pin: atHip(110, FLOOR - 6), ...extra };
}
/** Face down, head to the right (planks, push-ups). */
function faceDown(extra: Partial<Pose>): Pose {
  // A straight body: the legs continue the line of the torso.
  const torso = extra.torso ?? 66;
  return { torso, arm: [0, 0], leg: [-torso, -torso], pin: atHand(150, FLOOR - 3), ...extra };
}
/** On hands and knees. */
function quad(extra: Partial<Pose>): Pose {
  return { torso: 90, arm: [0, 0], leg: [0, -90], pin: { joint: 'knee', at: [80, FLOOR - 4] }, ...extra };
}

const BAR_RACK: Ang2 = [-45, 165];
const FRONT_RACK: Ang2 = [50, 185];
const OVERHEAD: Ang2 = [178, 180];
const SQUAT_LEGS: Ang2 = [82, -32];
const HINGE_LEGS: Ang2 = [14, -8];
const benchProp = { kind: 'bench', x: 52, y: 136, w: 100 } as const;
const seat = { kind: 'bench', x: 56, y: 122, w: 40, h: 56 } as const;

const m = (a: Pose, b?: Pose, props?: Prop[], dur?: number): Motion => ({ a, b, props, dur });

// ---------- movement patterns ----------

const squatBar = m(stand(BAR_RACK), stand(BAR_RACK, { torso: 38, leg: SQUAT_LEGS }), [{ kind: 'barbell', at: 'neck' }]);
const frontSquat = m(stand(FRONT_RACK), stand(FRONT_RACK, { torso: 22, leg: SQUAT_LEGS }), [{ kind: 'barbell', at: 'hand' }]);
const gobletSquat = m(stand([25, 165]), stand([25, 165], { torso: 25, leg: SQUAT_LEGS }), [{ kind: 'kettlebell', at: 'hand' }]);
const bwSquat = m(stand([90, 90]), stand([90, 90], { torso: 32, leg: SQUAT_LEGS }));
const lunge = (props: Prop[] = [], arm: Ang2 = [0, 0]) =>
  m(stand(arm, { pin: onFeet(110) }), stand(arm, { leg: [80, -2], leg2: [-12, -95], pin: onFeet(110) }), props);
const deadlift = m(stand([0, 0], { torso: 62, leg: [72, -14] }), stand(), [{ kind: 'barbell', at: 'hand' }]);
const rdl = (prop: Prop['kind'] = 'barbell') => m(stand(), stand([0, 0], { torso: 78, leg: HINGE_LEGS }), [{ kind: prop, at: 'hand' } as Prop]);
const benchPress = (prop: 'barbell' | 'dumbbell', torso = -90) =>
  m(benchLie([180, 180], { torso }), benchLie([-25, 175], { torso }), [benchProp, { kind: prop, at: 'hand' }]);
const pushUp = () => m(faceDown({ torso: 66 }), faceDown({ torso: 78, arm: [-95, 0] }));
const pullUp = m({ torso: 0, arm: OVERHEAD, leg: [0, -40], pin: atHand(100, 34) }, { torso: 0, arm: [25, 170], leg: [0, -40], pin: atHand(100, 34) }, [{ kind: 'bar', y: 34 }]);
const latPulldown = m(seated(OVERHEAD), seated([20, 170]), [seat, { kind: 'cable', from: [92, 8] }]);
const row = (prop: 'barbell' | 'dumbbell' = 'barbell') =>
  m(stand([0, 0], { torso: 72, leg: [24, -10] }), stand([-70, 15], { torso: 72, leg: [24, -10] }), [{ kind: prop, at: 'hand' }]);
const cableRow = m(
  { torso: 8, arm: [90, 90], leg: [86, 92], pin: atHip(60, FLOOR - 8) },
  { torso: -8, arm: [-75, 90], leg: [86, 92], pin: atHip(60, FLOOR - 8) },
  [{ kind: 'cable', from: [190, 150] }],
);
const ohp = (prop: 'barbell' | 'dumbbell' = 'barbell', base: (a: Ang2) => Pose = stand) =>
  m(base(FRONT_RACK), base(OVERHEAD), base === stand ? [{ kind: prop, at: 'hand' }] : [seat, { kind: prop, at: 'hand' }]);
const curl = (prop: Prop['kind'] = 'dumbbell') => m(stand([0, 0]), stand([8, 168]), [{ kind: prop, at: 'hand' } as Prop]);
const frontRaise = (prop: Prop['kind'] = 'dumbbell') => m(stand([0, 0]), stand([90, 90]), [{ kind: prop, at: 'hand' } as Prop]);
const plank = m(faceDown({ torso: 77, arm: [0, 90], pin: { joint: 'foot', at: [40, FLOOR - 3] } }));
const crunch = m(floorLie({ arm: [20, 160], armRel: true, leg: [140, 20] }), floorLie({ torso: -55, arm: [20, 160], armRel: true, leg: [140, 20] }));
const hang = (b?: Partial<Pose>) => {
  const base: Pose = { torso: 0, arm: OVERHEAD, leg: [0, 0], pin: atHand(100, 30) };
  return m(base, b ? { ...base, ...b } : undefined, [{ kind: 'bar', y: 30 }]);
};
const run = (stride: number, dur: number, props: Prop[] = []) =>
  m(
    { torso: 8, arm: [-stride, 60], arm2: [stride, 80], leg: [stride, -10], leg2: [-stride * 0.7, -stride * 2], pin: atHip(96, 110) },
    { torso: 8, arm: [stride, 80], arm2: [-stride, 60], leg: [-stride * 0.7, -stride * 2], leg2: [stride, -10], pin: atHip(96, 110) },
    props,
    dur,
  );
const walk = (props: Prop[] = []) =>
  m(
    { torso: 2, arm: [-18, -8], arm2: [18, 30], leg: [20, 0], leg2: [-18, -18], pin: atHip(96, 108) },
    { torso: 2, arm: [18, 30], arm2: [-18, -8], leg: [-18, -18], leg2: [20, 0], pin: atHip(96, 108) },
    props,
    1.6,
  );
const bike = (arms: boolean) =>
  m(
    { torso: 28, arm: [72, 88], leg: [70, 10], leg2: [30, -20], pin: atHip(80, 106) },
    { torso: 28, arm: arms ? [52, 70] : [72, 88], arm2: arms ? [80, 100] : undefined, leg: [30, -20], leg2: [70, 10], pin: atHip(80, 106) },
    [
      { kind: 'wheel', at: [62, 160], r: 16 },
      { kind: 'wheel', at: [148, 160], r: 16 },
      { kind: 'line', from: [72, 112], to: [86, 160] },
      { kind: 'line', from: [86, 160], to: [140, 104] },
    ],
    1.2,
  );
const stretchHold = (p: Pose, props?: Prop[]) => m(p, { ...p, torso: p.torso + 4 }, props, 4);

const MOTIONS: Record<string, Motion> = {
  // chest
  'barbell-bench-press': benchPress('barbell'),
  'incline-barbell-bench-press': benchPress('barbell', -65),
  'decline-barbell-bench-press': benchPress('barbell', -105),
  'dumbbell-bench-press': benchPress('dumbbell'),
  'incline-dumbbell-press': benchPress('dumbbell', -65),
  'smith-machine-bench-press': benchPress('barbell'),
  'close-grip-bench-press': benchPress('barbell'),
  'machine-chest-press': m(seated([-80, 90]), seated([90, 90]), [seat]),
  'dumbbell-fly': m(benchLie([180, 180]), benchLie([-70, -80]), [benchProp, { kind: 'dumbbell', at: 'hand' }]),
  'cable-crossover': m(stand([-70, -40], { torso: 10 }), stand([80, 90], { torso: 10 }), [{ kind: 'cable', from: [40, 30] }]),
  'pec-deck': m(seated([-80, -60]), seated([88, 90]), [seat]),
  'push-up': pushUp(),
  'incline-push-up': m(faceDown({ torso: 35, pin: atHand(150, 128) }), faceDown({ torso: 50, arm: [-95, 0], pin: atHand(150, 128) }), [{ kind: 'box', x: 135, y: 130, w: 40, h: 48 }]),
  'diamond-push-up': pushUp(),
  'chest-dip': m({ torso: 0, arm: [0, 0], leg: [0, -80], pin: atHand(100, 96) }, { torso: 22, arm: [-75, 2], leg: [0, -80], pin: atHand(100, 96) }, [{ kind: 'bar', y: 96, x: 84, w: 34 }]),
  // back
  'pull-up': pullUp,
  'chin-up': pullUp,
  'assisted-pull-up': pullUp,
  'lat-pulldown': latPulldown,
  'close-grip-lat-pulldown': latPulldown,
  'barbell-row': row(),
  'pendlay-row': row(),
  't-bar-row': row(),
  'dumbbell-row': row('dumbbell'),
  'chest-supported-row': row('dumbbell'),
  'seated-cable-row': cableRow,
  'inverted-row': m(
    { torso: -72, arm: [180, 180], armRel: false, leg: [72, 72], pin: atHand(90, 70) },
    { torso: -60, arm: [210, 150], leg: [60, 60], pin: atHand(90, 70) },
    [{ kind: 'bar', y: 70 }],
  ),
  'straight-arm-pulldown': m(stand([150, 150], { torso: 15 }), stand([-15, -15], { torso: 15 }), [{ kind: 'cable', from: [150, 20] }]),
  'face-pull': m(stand([90, 90]), stand([-60, 150]), [{ kind: 'cable', from: [185, 60] }]),
  'barbell-shrug': m(stand(), stand([0, 0], { shrug: 7 }), [{ kind: 'barbell', at: 'hand' }], 1.6),
  'dumbbell-shrug': m(stand(), stand([0, 0], { shrug: 7 }), [{ kind: 'dumbbell', at: 'hand' }], 1.6),
  deadlift,
  'sumo-deadlift': deadlift,
  'trap-bar-deadlift': deadlift,
  'rack-pull': m(stand([0, 0], { torso: 40, leg: [30, -6] }), stand(), [{ kind: 'barbell', at: 'hand' }]),
  'romanian-deadlift': rdl(),
  'dumbbell-romanian-deadlift': rdl('dumbbell'),
  'good-morning': m(stand(BAR_RACK), stand(BAR_RACK, { torso: 78, leg: HINGE_LEGS }), [{ kind: 'barbell', at: 'neck' }]),
  'back-extension': m(
    { torso: 130, arm: [20, 160], armRel: true, leg: [-55, -55], pin: atHip(100, 104) },
    { torso: 55, arm: [20, 160], armRel: true, leg: [-55, -55], pin: atHip(100, 104) },
    [{ kind: 'bench', x: 82, y: 108, w: 20, h: 70 }],
  ),
  superman: m(
    { torso: 90, arm: [0, 0], armRel: true, leg: [-90, -90], pin: atHip(96, FLOOR - 5) },
    { torso: 78, arm: [-6, -6], armRel: true, leg: [-102, -102], pin: atHip(96, FLOOR - 5) },
  ),
  // shoulders
  'overhead-press': ohp(),
  'push-press': m(stand(FRONT_RACK, { leg: [24, -22] }), stand(OVERHEAD), [{ kind: 'barbell', at: 'hand' }]),
  'seated-dumbbell-shoulder-press': ohp('dumbbell', (a) => seated(a)),
  'arnold-press': ohp('dumbbell', (a) => seated(a)),
  'machine-shoulder-press': ohp('dumbbell', (a) => seated(a)),
  'landmine-press': m(stand([40, 170], { torso: 10 }), stand([135, 135], { torso: 10 }), [{ kind: 'cable', from: [30, FLOOR - 2] }]),
  'lateral-raise': { a: stand(), front: { a: { arms: 12, legs: 6 }, b: { arms: 85, legs: 6 }, props: [{ kind: 'dumbbell', at: 'hand' }] } },
  'cable-lateral-raise': { a: stand(), front: { a: { arms: 12, legs: 6 }, b: { arms: 85, legs: 6 } } },
  'front-raise': frontRaise(),
  'rear-delt-fly': m(stand([0, 0], { torso: 78, leg: HINGE_LEGS }), stand([-80, -80], { torso: 78, leg: HINGE_LEGS }), [{ kind: 'dumbbell', at: 'hand' }]),
  'reverse-pec-deck': m(seated([90, 90]), seated([-80, -80]), [seat]),
  'upright-row': m(stand([0, 0]), stand([118, 0]), [{ kind: 'barbell', at: 'hand' }]),
  'pike-push-up': m(
    { torso: 125, arm: [0, 0], leg: [-40, -40], pin: atHand(130, FLOOR - 3) },
    { torso: 125, arm: [60, -20], leg: [-40, -40], pin: atHand(130, FLOOR - 3) },
  ),
  'handstand-push-up': m(
    { torso: 180, arm: [0, 0], leg: [180, 180], pin: atHand(100, FLOOR - 3) },
    { torso: 180, arm: [60, -40], leg: [180, 180], pin: atHand(100, FLOOR - 3) },
    [{ kind: 'wall', x: 112 }],
  ),
  // arms
  'barbell-curl': curl('barbell'),
  'ez-bar-curl': curl('barbell'),
  'dumbbell-curl': curl(),
  'hammer-curl': curl(),
  'cable-curl': m(stand([0, 0]), stand([8, 168]), [{ kind: 'cable', from: [120, FLOOR - 2] }]),
  'reverse-curl': curl('barbell'),
  'incline-dumbbell-curl': m(seated([-10, -10], { torso: -25 }), seated([-10, 160], { torso: -25 }), [{ kind: 'bench', x: 40, y: 122, w: 50, h: 56 }, { kind: 'dumbbell', at: 'hand' }]),
  'preacher-curl': m(seated([45, 40]), seated([45, 170]), [seat, { kind: 'bench', x: 92, y: 100, w: 24, h: 24 }, { kind: 'barbell', at: 'hand' }]),
  'concentration-curl': m(seated([20, 15], { torso: 30 }), seated([20, 170], { torso: 30 }), [seat, { kind: 'dumbbell', at: 'hand' }]),
  'triceps-pushdown': m(stand([4, 170], { torso: 8 }), stand([4, 4], { torso: 8 }), [{ kind: 'cable', from: [120, 30] }]),
  'overhead-triceps-extension': m(stand([175, -10]), stand([175, 180]), [{ kind: 'dumbbell', at: 'hand' }]),
  'skull-crusher': m(benchLie([170, 180]), benchLie([170, -110]), [benchProp, { kind: 'barbell', at: 'hand' }]),
  'triceps-kickback': m(stand([-80, 0], { torso: 72, leg: HINGE_LEGS }), stand([-80, -80], { torso: 72, leg: HINGE_LEGS }), [{ kind: 'dumbbell', at: 'hand' }]),
  'bench-dip': m(
    { torso: 0, arm: [-25, -5], leg: [88, 88], pin: atHand(70, 122) },
    { torso: 10, arm: [-85, -10], leg: [70, 100], pin: atHand(70, 122) },
    [{ kind: 'bench', x: 40, y: 124, w: 36 }],
  ),
  'wrist-curl': m(seated([60, 90]), seated([60, 120]), [seat, { kind: 'dumbbell', at: 'hand' }], 1.6),
  'reverse-wrist-curl': m(seated([60, 90]), seated([60, 60]), [seat, { kind: 'dumbbell', at: 'hand' }], 1.6),
  'farmers-carry': walk([{ kind: 'dumbbell', at: 'hand' }]),
  'dead-hang': hang(),
  // legs
  'back-squat': squatBar,
  'front-squat': frontSquat,
  'goblet-squat': gobletSquat,
  'bodyweight-squat': bwSquat,
  'hack-squat': squatBar,
  'leg-press': m(
    { torso: -55, arm: [0, 0], armRel: false, leg: [128, 128], pin: atHip(70, 140) },
    { torso: -55, arm: [0, 0], leg: [165, 70], pin: atHip(70, 140) },
    [{ kind: 'bench', x: 30, y: 144, w: 50, h: 34 }],
  ),
  'bulgarian-split-squat': m(
    stand([0, 0], { leg: [0, 0], leg2: [-40, -100], pin: onFeet(118) }),
    stand([0, 0], { leg: [78, -4], leg2: [-30, -110], pin: onFeet(118) }),
    [{ kind: 'bench', x: 30, y: 140, w: 44, h: 38 }, { kind: 'dumbbell', at: 'hand' }],
  ),
  'walking-lunge': lunge([{ kind: 'dumbbell', at: 'hand' }]),
  'reverse-lunge': lunge([{ kind: 'dumbbell', at: 'hand' }]),
  'static-lunge': lunge([{ kind: 'barbell', at: 'neck' }], BAR_RACK),
  'step-up': m(
    stand([0, 0], { leg: [75, -5], leg2: [0, 0], pin: { joint: 'foot2', at: [92, FLOOR - 3] } }),
    stand([0, 0], { pin: { joint: 'foot', at: [120, 140] } }),
    [{ kind: 'box', x: 108, y: 144, w: 50, h: 34 }, { kind: 'dumbbell', at: 'hand' }],
  ),
  'pistol-squat': m(stand([90, 90]), stand([90, 90], { torso: 30, leg: SQUAT_LEGS, leg2: [85, 85] })),
  'leg-extension': m(seated([0, 0], { leg: [90, 5] }), seated([0, 0], { leg: [90, 90] }), [seat]),
  'lying-leg-curl': m(
    { torso: 90, arm: [0, 0], armRel: true, leg: [-90, -90], pin: atHip(110, 132) },
    { torso: 90, arm: [0, 0], armRel: true, leg: [-90, 150], pin: atHip(110, 132) },
    [{ kind: 'bench', x: 60, y: 136, w: 110 }],
  ),
  'seated-leg-curl': m(seated([0, 0], { leg: [90, 70] }), seated([0, 0], { leg: [90, -30] }), [seat]),
  'nordic-curl': m(
    { torso: 0, arm: [20, 160], armRel: true, leg: [0, -90], pin: { joint: 'knee', at: [100, FLOOR - 4] } },
    { torso: 62, arm: [20, 160], armRel: true, leg: [62, -90], pin: { joint: 'knee', at: [100, FLOOR - 4] } },
  ),
  'hip-thrust': m(
    { torso: -70, arm: [-10, -10], leg: [55, 0], pin: { joint: 'neck', at: [60, 120] } },
    { torso: -92, arm: [-10, -10], leg: [92, 0], pin: { joint: 'neck', at: [60, 120] } },
    [{ kind: 'bench', x: 20, y: 124, w: 46 }, { kind: 'barbell', at: 'hip' }],
  ),
  'glute-bridge': m(
    { torso: -90, arm: [0, 0], armRel: true, leg: [135, 15], pin: { joint: 'neck', at: [50, FLOOR - 5] } },
    { torso: -112, arm: [0, 0], armRel: true, leg: [100, 0], pin: { joint: 'neck', at: [50, FLOOR - 5] } },
  ),
  'cable-kickback': m(
    stand([60, 60], { torso: 25, pin: { joint: 'foot2', at: [96, FLOOR - 3] } }),
    stand([60, 60], { torso: 25, leg: [-60, -60], pin: { joint: 'foot2', at: [96, FLOOR - 3] } }),
    [{ kind: 'cable', from: [150, FLOOR - 4], to: 'foot' }],
  ),
  'hip-abduction-machine': { a: seated(), front: { a: { arms: 15, legs: 4, seated: true }, b: { arms: 15, legs: 32, seated: true } } },
  'hip-adduction-machine': { a: seated(), front: { a: { arms: 15, legs: 32, seated: true }, b: { arms: 15, legs: 4, seated: true } } },
  'lateral-band-walk': { a: stand(), front: { a: { arms: 10, legs: 6 }, b: { arms: 10, legs: 20 } } },
  'copenhagen-plank': m(faceDown({ torso: 100, arm: [0, 90], arm2: [180, 180], pin: { joint: 'foot', at: [40, 132] } }), undefined, [{ kind: 'bench', x: 20, y: 136, w: 40 }]),
  'standing-calf-raise': m(stand(), stand([0, 0], { pin: { joint: 'foot', at: [96, FLOOR - 11] } }), [], 1.4),
  'seated-calf-raise': m(seated([0, 0], { leg: [90, 0] }), seated([0, 0], { leg: [90, 0], pin: atHip(80, 110) }), [seat], 1.4),
  // power and conditioning
  'kettlebell-swing': m(stand([-15, -15], { torso: 58, leg: [38, -16] }), stand([90, 90]), [{ kind: 'kettlebell', at: 'hand' }], 1.4),
  'box-jump': m(stand([-40, -40], { torso: 35, leg: SQUAT_LEGS }), stand([80, 80], { pin: { joint: 'foot', at: [132, 151] } }), [{ kind: 'box', x: 112, y: 154, w: 54, h: 24 }]),
  'jump-squat': m(stand([-40, -40], { torso: 32, leg: SQUAT_LEGS }), stand([20, 20], { pin: { joint: 'foot', at: [96, 165] } }), [], 1.4),
  'sled-push': m(
    { torso: 55, arm: [85, 85], leg: [55, -10], leg2: [-30, -40], pin: atHip(80, 112) },
    { torso: 55, arm: [85, 85], leg: [-30, -40], leg2: [55, -10], pin: atHip(80, 112) },
    [{ kind: 'box', x: 150, y: 120, w: 26, h: 58 }],
    1.4,
  ),
  burpee: m(stand([170, 170], { pin: onFeet(110) }), faceDown({ pin: { joint: 'foot', at: [50, FLOOR - 3] } }), [], 2.2),
  thruster: m(stand(FRONT_RACK, { torso: 22, leg: SQUAT_LEGS }), stand(OVERHEAD), [{ kind: 'barbell', at: 'hand' }]),
  'wall-ball': m(stand([25, 165], { torso: 25, leg: SQUAT_LEGS }), stand([165, 165]), [{ kind: 'ball', at: 'hand' }, { kind: 'wall', x: 170 }]),
  'power-clean': m(stand([0, 0], { torso: 62, leg: [72, -14] }), stand(FRONT_RACK), [{ kind: 'barbell', at: 'hand' }]),
  'clean-and-press': m(stand([0, 0], { torso: 62, leg: [72, -14] }), stand(OVERHEAD), [{ kind: 'barbell', at: 'hand' }], 2.6),
  'barbell-warm-up': m(stand([0, 0], { torso: 62, leg: [72, -14] }), stand(OVERHEAD), [{ kind: 'barbell', at: 'hand' }], 2.6),
  'dumbbell-snatch': m(stand([0, 0], { torso: 55, leg: [60, -14], arm2: [-20, -20] }), stand(OVERHEAD, { arm2: [0, 0] }), [{ kind: 'dumbbell', at: 'hand' }]),
  'turkish-get-up': m(floorLie({ arm: [180, 180], arm2: [0, 0], leg: [135, 20] }), stand(OVERHEAD, { arm2: [0, 0], pin: onFeet(100) }), [{ kind: 'kettlebell', at: 'hand' }], 3.2),
  'medicine-ball-slam': m(stand([170, 170]), stand([40, 40], { torso: 45, leg: [45, -20] }), [{ kind: 'ball', at: 'hand' }], 1.4),
  'battle-ropes': m(
    stand([55, 60], { torso: 18, leg: [40, -22] }),
    stand([95, 100], { torso: 18, leg: [40, -22] }),
    [{ kind: 'cable', from: [190, FLOOR - 4] }],
    0.8,
  ),
  'jumping-jack': { a: stand(), front: { a: { arms: 15, legs: 5 }, b: { arms: 165, legs: 22, lift: 4 } } },
  'jump-rope': { a: stand(), front: { a: { arms: 30, legs: 5, lift: 0 }, b: { arms: 30, legs: 5, lift: 9 } } },
  // cardio
  running: run(38, 0.9),
  'treadmill-run': run(38, 0.9, [{ kind: 'line', from: [40, FLOOR + 2], to: [160, FLOOR + 2] }, { kind: 'line', from: [160, FLOOR + 2], to: [168, 90] }]),
  'incline-walk': walk([{ kind: 'line', from: [40, FLOOR + 2], to: [160, FLOOR + 2] }, { kind: 'line', from: [160, FLOOR + 2], to: [168, 90] }]),
  walking: walk(),
  cycling: bike(false),
  'stationary-bike': bike(false),
  'air-bike': bike(true),
  'rowing-machine': m(
    { torso: 25, arm: [92, 92], leg: [150, 35], pin: { joint: 'foot', at: [150, 158] } },
    { torso: -22, arm: [-70, 85], leg: [96, 90], pin: { joint: 'foot', at: [150, 158] } },
    [{ kind: 'line', from: [20, 168], to: [170, 168] }],
    1.8,
  ),
  'ski-erg': m(stand(OVERHEAD), stand([-25, -25], { torso: 55, leg: [30, -14] }), [{ kind: 'cable', from: [140, 20] }], 1.4),
  elliptical: walk([{ kind: 'cable', from: [150, 80] }]),
  'stair-climber': m(
    { torso: 10, arm: [60, 80], leg: [70, -5], leg2: [0, 0], pin: atHip(96, 110) },
    { torso: 10, arm: [60, 80], leg: [0, 0], leg2: [70, -5], pin: atHip(96, 110) },
    [],
    1.2,
  ),
  swimming: m(
    { torso: 90, arm: [90, 90], armRel: false, arm2: [-10, -20], leg: [-90, -95], leg2: [-90, -82], pin: atHip(96, 120) },
    { torso: 90, arm: [-10, -20], arm2: [90, 90], leg: [-90, -82], leg2: [-90, -95], pin: atHip(96, 120) },
    [{ kind: 'line', from: [10, 108], to: [190, 108] }],
    1.4,
  ),
  // core
  plank,
  'side-plank': m(faceDown({ torso: 77, arm: [0, 90], arm2: [180, 180], pin: { joint: 'foot', at: [40, FLOOR - 3] } })),
  crunch,
  'abs-mixed': crunch,
  'bicycle-crunch': m(
    floorLie({ torso: -65, arm: [20, 160], armRel: true, leg: [150, 70], leg2: [100, 100] }),
    floorLie({ torso: -65, arm: [20, 160], armRel: true, leg: [100, 100], leg2: [150, 70] }),
  ),
  'hanging-leg-raise': hang({ leg: [92, 92] }),
  'hanging-knee-raise': hang({ leg: [110, 0] }),
  'cable-crunch': m(
    { torso: 20, arm: [150, 30], armRel: true, leg: [0, -90], pin: { joint: 'knee', at: [100, FLOOR - 4] } },
    { torso: 80, arm: [150, 30], armRel: true, leg: [10, -90], pin: { joint: 'knee', at: [100, FLOOR - 4] } },
    [{ kind: 'cable', from: [150, 16] }],
  ),
  'russian-twist': m(
    { torso: -35, arm: [100, 100], leg: [120, 70], pin: atHip(96, FLOOR - 6) },
    { torso: -35, arm: [60, 60], leg: [120, 70], pin: atHip(96, FLOOR - 6) },
    [{ kind: 'ball', at: 'hand' }],
    1.2,
  ),
  'ab-wheel-rollout': m(
    { torso: 45, arm: [0, 0], leg: [0, -90], pin: { joint: 'knee', at: [80, FLOOR - 4] } },
    { torso: 82, arm: [92, 92], leg: [82, -90], pin: { joint: 'knee', at: [80, FLOOR - 4] } },
    [{ kind: 'ball', at: 'hand' }],
  ),
  'dead-bug': m(floorLie({ arm: [180, 180], leg: [150, 90] }), floorLie({ arm: [-90, -90], arm2: [180, 180], leg: [100, 100], leg2: [150, 90] })),
  'hollow-hold': m(floorLie({ torso: -75, arm: [0, 0], armRel: true, leg: [100, 100] })),
  'v-up': m(floorLie({ arm: [0, 0], armRel: true, leg: [92, 92] }), floorLie({ torso: -35, arm: [150, 150], leg: [140, 140] })),
  'lying-leg-raise': m(floorLie({ arm: [-90, -90], leg: [96, 96] }), floorLie({ arm: [-90, -90], leg: [175, 175] })),
  'flutter-kicks': m(floorLie({ arm: [-90, -90], leg: [100, 100], leg2: [120, 120] }), floorLie({ arm: [-90, -90], leg: [120, 120], leg2: [100, 100] }), [], 0.8),
  'pallof-press': m(stand([20, 155]), stand([90, 90]), [{ kind: 'cable', from: [185, 100] }]),
  'cable-woodchopper': m(stand([150, 150], { torso: -5 }), stand([30, 30], { torso: 30, leg: [20, -10] }), [{ kind: 'cable', from: [30, 20] }]),
  'bird-dog': m(quad({}), quad({ arm: [90, 90], arm2: [0, 0], leg: [0, -90], leg2: [-90, -90] })),
  'mountain-climber': m(
    faceDown({ torso: 66, leg: [60, -30], leg2: [-66, -66] }),
    faceDown({ torso: 66, leg: [-66, -66], leg2: [60, -30] }),
    [],
    0.8,
  ),
  'plank-shoulder-tap': m(faceDown({ torso: 66 }), faceDown({ torso: 66, arm: [40, 230], arm2: [0, 0], pin: { joint: 'hand2', at: [150, FLOOR - 3] } }), [], 1.4),
  'neck-flexion': m(benchLie([170, 175], { head: 0 }), benchLie([170, 175], { head: 45 }), [benchProp, { kind: 'plate', at: 'neck' }], 1.6),
  'neck-extension': m({ ...benchLie([0, 0]), torso: 90, leg: [-90, -90], head: 30 }, { ...benchLie([0, 0]), torso: 90, leg: [-90, -90], head: -25 }, [benchProp, { kind: 'plate', at: 'neck' }], 1.6),
  // mobility
  'hip-flexor-stretch': stretchHold({ torso: -5, arm: [0, 0], leg: [80, 0], leg2: [-20, -95], pin: { joint: 'knee2', at: [70, FLOOR - 4] } }),
  'hamstring-stretch': stretchHold(stand([0, 0], { torso: 85 })),
  'couch-stretch': stretchHold({ torso: 0, arm: [0, 0], leg: [80, 0], leg2: [-15, 175], pin: { joint: 'knee2', at: [70, FLOOR - 4] } }, [{ kind: 'wall', x: 40 }]),
  'pigeon-stretch': stretchHold({ torso: 30, arm: [0, 0], leg: [80, -80], leg2: [-90, -92], pin: atHip(100, FLOOR - 10) }),
  'cat-cow': m(quad({ torso: 82, head: -20 }), quad({ torso: 98, head: 25 }), [], 3),
  'thoracic-rotation': m(quad({}), quad({ arm: [180, 180], arm2: [0, 0] }), [], 2.4),
  'worlds-greatest-stretch': m(
    stand([0, 0], { torso: 40, leg: [80, -2], leg2: [-30, -70], pin: onFeet(118) }),
    stand([180, 180], { arm2: [0, 0], torso: 40, leg: [80, -2], leg2: [-30, -70], pin: onFeet(118) }),
    [],
    3,
  ),
  'deep-squat-hold': stretchHold(stand([90, 90], { torso: 30, leg: [100, -40] })),
  'band-shoulder-dislocate': m(stand([90, 90]), stand([210, 210]), [], 2.6),
  'calf-stretch': stretchHold(stand([80, 80], { torso: 20, leg: [40, 0], leg2: [-30, -30], pin: onFeet(130) }), [{ kind: 'wall', x: 165 }]),
  'mobility-routine': m(stand(OVERHEAD), stand([0, 0], { torso: 100, leg: [0, 0] }), [], 3.2),
  'stretching-routine': m(stand(OVERHEAD), stand([0, 0], { torso: 100, leg: [0, 0] }), [], 3.2),
};

/** Keywords for exercises without their own animation (custom ones): first match wins. */
const KEYWORDS: [RegExp, string][] = [
  [/bench|chest press/i, 'barbell-bench-press'],
  [/push.?up/i, 'push-up'],
  [/dip/i, 'chest-dip'],
  [/pull.?up|chin.?up/i, 'pull-up'],
  [/pulldown/i, 'lat-pulldown'],
  [/row/i, 'barbell-row'],
  [/shrug/i, 'barbell-shrug'],
  [/romanian|rdl|stiff/i, 'romanian-deadlift'],
  [/deadlift/i, 'deadlift'],
  [/hip thrust/i, 'hip-thrust'],
  [/bridge/i, 'glute-bridge'],
  [/kickback/i, 'cable-kickback'],
  [/abduct/i, 'hip-abduction-machine'],
  [/adduct/i, 'hip-adduction-machine'],
  [/split squat|bulgarian/i, 'bulgarian-split-squat'],
  [/lunge/i, 'walking-lunge'],
  [/step.?up/i, 'step-up'],
  [/leg press/i, 'leg-press'],
  [/leg extension/i, 'leg-extension'],
  [/leg curl|hamstring curl/i, 'lying-leg-curl'],
  [/front squat/i, 'front-squat'],
  [/goblet/i, 'goblet-squat'],
  [/squat/i, 'back-squat'],
  [/calf/i, 'standing-calf-raise'],
  [/overhead press|shoulder press|military/i, 'overhead-press'],
  [/lateral raise/i, 'lateral-raise'],
  [/front raise/i, 'front-raise'],
  [/curl/i, 'dumbbell-curl'],
  [/triceps|tricep|pushdown|extension/i, 'triceps-pushdown'],
  [/fly|flye/i, 'dumbbell-fly'],
  [/swing/i, 'kettlebell-swing'],
  [/plank/i, 'plank'],
  [/crunch|sit.?up|abs/i, 'crunch'],
  [/leg raise/i, 'lying-leg-raise'],
  [/burpee/i, 'burpee'],
  [/jump/i, 'jump-squat'],
  [/run|jog/i, 'running'],
  [/walk/i, 'walking'],
  [/bike|cycl/i, 'stationary-bike'],
  [/row(er|ing)/i, 'rowing-machine'],
  [/stretch/i, 'hamstring-stretch'],
];

/** The animation for an exercise: its own, or one matched from its name; null when nothing fits. */
export function motionFor(id: string, name = ''): Motion | null {
  const own = MOTIONS[id] ?? MOTIONS[id.replace(/^custom-/, '')];
  if (own) return own;
  const hit = KEYWORDS.find(([re]) => re.test(name));
  return hit ? MOTIONS[hit[1]] : null;
}

export const MOTION_IDS = Object.keys(MOTIONS);
