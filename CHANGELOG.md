# Changelog

All notable changes to this project. Dates are in YYYY-MM-DD.

## Phase 1 — Core app and offline (2026-10-12)
- Project setup: React + TypeScript + Vite, dark theme, mobile-first layout with a sidebar on wide screens.
- PWA: web app manifest, icons, service worker (vite-plugin-pwa / Workbox) that precaches the whole app for offline use, and an in-app “new version available” prompt.
- Install instructions for iPhone (Safari → Add to Home Screen) and Mac in Settings.
- Dexie (IndexedDB) database with the full data model: exercises, programs, sessions, body weight log, profile and settings.
- Exercise catalog of 150 exercises with primary and secondary muscles, written for this app (`src/data/exercises.json`).
- Exercise library with search, category and muscle filters; create, edit, duplicate and delete custom exercises.
- Profile: sex, birth date or age, height, body weight, kg/lb, default rest and get-ready times.
- Requests persistent storage on first launch and shows the status in Settings.

## Phase 2 — Programs and planning (2026-10-12)
- Weekly programs with days (optional weekday), ordered blocks and exercise entries.
- Block formats: Sets × Reps, Timed sets, Tabata, AMRAP, EMOM, For Time and Intervals, each with its own parameters and timer options (get-ready time, labels, sound, vibration).
- Groupings: superset, circuit (group labels A–F) and drop set (number of drops and % reduction).
- Duplicate programs, days and blocks; reorder days, blocks and exercises.
- “Add a sample week” creates an example program that uses every format.
- Start a workout from any program day. The workout gets its own copy of the plan, so quick edits (sets, weights, exercises, blocks) apply to that session only.
- Today screen: workouts in progress, days planned for today’s weekday, free workout.
