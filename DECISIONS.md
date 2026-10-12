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
