# Decisions

Choices made while building the app, with the reason for each.

## Stack
- **React 19 + TypeScript + Vite 8**, as suggested.
- **HashRouter** (`/#/exercises`) instead of path URLs. GitHub Pages has no server-side rewrites, so path URLs would return 404 on reload. Hash URLs always load `index.html`.
- **Recharts** for charts: React-friendly and good enough for the data sizes of a personal log. The analytics screen is lazy-loaded so the chart library does not slow down startup.
- **Plain CSS with variables** instead of a CSS framework, to keep the bundle small and startup fast on older iPhones.
- **Node.js** was installed locally to `~/.local/node` (no admin rights needed). To use it in a terminal: `export PATH=~/.local/node/bin:$PATH`.

## Data
- All weights are stored in **kilograms**. The UI converts to pounds when the profile unit is lb.
- Derived values (volume, 1RM, PRs, estimated calories, muscle distribution) are **computed when shown, never stored**. Editing a logged session therefore updates everything automatically.
- Only **imported** calories are stored on a session (`importedCalories`). Estimated calories are recomputed from the weight log and profile.
- Built-in exercises have stable ids and are **read-only**; use Duplicate to make an editable copy. Backups contain only custom exercises; the built-in catalog is re-seeded by version number (`SEED_VERSION`).
- Muscle list: the 19 muscle groups from the brief; “upper back” includes trapezius and rhomboids.
- Each exercise has an optional `tracking` field (weight × reps, reps, time, time + distance) that decides which inputs the log shows. It is an addition to the brief’s data model.
- Sex has a third option, “Not set”. The BMR formula then uses the midpoint of the male and female constants (−78).
- The app asks for persistent storage (`navigator.storage.persist()`) once on first launch; Settings shows the status and can ask again.

## Planning
- **Mixed workout** = a program day with several blocks of different formats. The timer can run the blocks one after another as one session (Phase 3), so there is no separate “mixed” block type.
- **Grouping is set per exercise entry.** Consecutive entries with the same grouping (superset or circuit) and the same group label (A–F) form one group. Superset: exercises run back to back, then the rest of the last exercise. Circuit: the group repeats for the number of sets, and each exercise’s rest is used as the transition time.
- **Drop set weights** are planned from the target weight and the drop %, rounded to 0.5 kg.
- **Per-session override:** starting a workout copies the day’s blocks into the session (new ids). Editing the workout never changes the program. Completed sets survive later plan edits.
- Program edits auto-save after a short pause (400 ms) and when leaving the screen.
- Weekday numbering: 0 = Monday … 6 = Sunday. Weeks start on Monday everywhere in the app.

## Timer
- **Engine = pure functions over wall-clock timestamps** (`src/lib/timer/engine.ts`). Each phase starts exactly when the previous one was planned to end, so nothing drifts and a long background pause is replayed correctly on return (`visibilitychange` → `sync`).
- **iPhone background behaviour (important):** iOS pauses web apps when the screen locks. The app therefore (1) keeps the screen on with the Wake Lock API while the timer runs, (2) pre-schedules all upcoming beeps on the Web Audio clock, (3) sets the Safari Audio Session to “playback” and plays near-silent audio so iOS is more likely to keep the audio running with the screen locked (Settings → “Background audio”), and (4) recalculates everything from the clock when the app returns. The time shown is always correct; whether beeps sound *while the screen is locked* depends on iOS and cannot be guaranteed for a web app. Keeping the screen on is the reliable option.
- Rep-based work phases are **open-ended**: they end when you tap Done (the rest countdown starts then). Timed exercises (e.g. a plank inside a circuit) run as countdowns.
- A block never ends on a rest phase; the last rest is dropped.
- Tabata: exercises rotate by round (round 1 = exercise 1, round 2 = exercise 2, …). EMOM: the same rotation per interval.
- Get-ready countdown is per block (default from the profile, 10 s). In a mixed run each block starts with its own get-ready phase.
- The timer run state is saved in `localStorage` (small, written on every phase change), so a paused or interrupted run can be resumed. Logged sets are written to the database immediately.
- Closing the timer while it runs pauses it.
- Resetting a timer keeps sets that were already logged.

## Logging and progression
- **Estimated 1RM = Epley**: weight × (1 + reps / 30); a single rep returns the weight. Sets without weight or reps have no 1RM.
- **Volume** = reps × weight, plus reps × weight of every drop. Bodyweight sets without added weight have zero volume (reps are still counted).
- **AMRAP / For Time** are logged as a result (rounds + extra reps, time). For volume and muscle work, the result becomes rounds × planned reps per exercise; extra reps are added to the exercises in order.
- **Progress** = more weight, or the same weight with more reps, or the same with a longer time, compared with the same set number in the previous session with that exercise. Per exercise, a session is marked as progress when 1RM, top weight or (at the same top weight) total reps or longest time went up.
- **PRs** compare a session with all completed sessions that started before it. Doing an exercise for the first time is not a PR. “Most reps at a weight” only counts weights done before. “Most rounds” compares AMRAPs with the same exercises and time cap.
- Set fields are prefilled from the plan (not from last time). Last time’s values are shown as a hint line and as placeholders.

## Muscle display
- Unit of work = one completed set; Tabata rounds, EMOM intervals and AMRAP rounds each count as a set; each drop counts as half a set.
- Primary muscles get 1 × the set, secondary muscles 0.5 ×. Colour intensity is relative to the most-worked muscle of the selection; the percentages are shares of the total.
- Imported cardio without sets (e.g. a Garmin run) maps the activity type to a catalog exercise and counts one unit per 10 minutes.
- The silhouette is a simplified drawing made for this app (inline SVG, mirrored halves).
