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

## Phase 3 — Timer (2026-10-12)
- Full-screen, high-contrast timer (black background, very large digits; green = work, blue = rest, yellow = get ready).
- All formats: Sets × Reps (rest countdown, “Done” per set), Timed sets, Tabata (rounds, sets, rest between sets), AMRAP (countdown plus elapsed time and a +1 round counter), EMOM (an interval per minute with a start sound and optional reps log), For Time (count-up, optional cap, Finish), Intervals (labelled work/rest segments, repeats) and mixed workouts (run all blocks back to back).
- Supersets, circuits and drop sets are expanded into the right sequence of sets, transitions and rests.
- Controls: start, pause, resume, skip, reset, finish; on a Mac also Space (start/pause), Enter (done), → (skip), Esc (close).
- Shows set, round, interval, the target (reps × weight) and what comes next.
- Sounds: three countdown beeps before every phase change, a distinct work-start, rest-start and finish sound; vibration where supported; mute button.
- Timestamp-based engine: time is always recalculated from the clock, so it stays correct after the screen was off or the app was in the background. Beeps are pre-scheduled on the audio clock.
- Keeps the screen awake (Screen Wake Lock) while the timer runs.
- Every timer run belongs to a logged session: completed sets are marked done (with reps/weight typed in the timer), Tabata/EMOM/interval rounds are logged, AMRAP/For Time results are saved, and each block’s active time is measured. A paused timer can be resumed later.
- Timer tab with quick timers (Tabata, AMRAP, EMOM, For Time, Intervals, Timed sets) and a list of program days to run.

## Phase 4 — Logging, progression and muscle display (2026-10-12)
- Workout logging per set: weight, reps, time (m:ss) and distance depending on the exercise; fields are prefilled from the plan. One tap marks a set done, tapping the set number skips it, add/remove sets, drop-set reps per drop.
- AMRAP and For Time results (rounds, extra reps, time) can be entered or edited on the workout screen.
- “Last time” line with the previous session’s sets next to every exercise, and a “▲ Progress” marker on sets that beat the same set last time.
- Session summary: duration, volume, sets and reps; per exercise best set, estimated 1RM (Epley), volume and change vs last time; “First time” and “Progress” badges.
- Personal records: max weight, estimated 1RM, most reps at a weight, longest time and most AMRAP rounds (same exercises and time cap).
- Exercise page: front/back body silhouette with primary and secondary muscles, best values and a chronological progression list.
- Session summary shows the silhouette coloured by the share of work per muscle, plus a ranked muscle list with percentages.
- History tab grouped by month; “Log past workout”; edit any logged session (sets, plan, date/time, duration, effort, notes); repeat a past workout.
- Fixed: fast consecutive taps could overwrite each other; all workout edits are now transactional.
