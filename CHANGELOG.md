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

## Phase 5 — Analytics, charts and calories (2026-10-12)
- Analytics screen with one period filter (4 weeks, 3, 6, 12 months, all) and, on a Mac, two charts side by side.
- Overview: workouts, total time, volume, calories, average duration, weekly streak, most trained muscle, most used exercise.
- Exercise progress: line chart of estimated 1RM, max weight, volume, total reps, most reps in a set or longest set, per exercise, with the change over the period.
- Period comparison: this week / month / 30 days / year vs the previous one, or two custom ranges; table with % change and a “running total by day” chart.
- Totals by week, month or year (volume, time, reps, sets, calories, sessions), per period or as a running total.
- Training frequency per week or month, and a calendar heatmap of workout days.
- Muscle distribution per workout, week or month (browse back in time), as bars or donut, with the body silhouette.
- Calories per workout, week or month (estimated vs imported), running totals, and an optional daily total (BMR + exercise).
- Every chart has a table view.
- Calories: MET method with a MET table by block type and effort, cardio METs per exercise, body weight from the weight log nearest to the workout date (fallback: profile weight), Mifflin-St Jeor BMR. Every calorie value shows its source (estimated or imported) and a note that estimates are approximate.
- Body weight log with a chart (Settings), BMR display and the MET table.
- Effort (light / moderate / vigorous) per workout.

## Phase 6 — Import, backup and Strava (2026-10-12)
- Backup export as one JSON file with a schema version; on iPhone it opens the share sheet (Save to Files / iCloud Drive, AirDrop), on a Mac it downloads.
- Backup import with a preview and two modes: replace all data, or merge (newest record wins). Older backup formats are migrated; files from a newer app version, damaged files and non-backup files are rejected with a clear message. Strava tokens are never included.
- Weekly backup reminder on the Today screen.
- Persistent storage request (from Phase 1) with status in Settings.
- Garmin FIT and TCX import: duration, distance, calories, average/max heart rate, heart-rate chart and activity type. Re-imports are detected, and an import that matches a workout logged in the app (start within 10 minutes, similar duration) is merged into it. Clear error message per file when an import fails.
- Strava: OAuth login through a small Cloudflare Worker (`worker/strava-worker.js`) that holds the client secret; only access/refresh tokens are stored on the device. Imports activities since a chosen date, fetches details (calories) only for new activities, stays under Strava’s rate limits, merges with existing workouts, can disconnect. Works around the iPhone home-screen redirect issue with a copy/paste connection code. The whole feature lives in `src/strava/` and can be switched off at runtime or at build time.
- Apple Health: documented extension point (`src/lib/importers/appleHealth.ts`), not implemented.
- GitHub Actions workflow that tests, builds and deploys to GitHub Pages.
- README with step-by-step setup for GitHub Pages, installing, backups, Garmin import and the Strava Worker.
- Robustness: if a page of an older version is missing after an update the app reloads itself; errors on a screen show a message with a Reload button instead of a blank page.
- Example FIT and TCX files in `samples/`.

## Verification (2026-10-12)
- 87 unit tests pass (`npm test`): calories and BMR, Epley 1RM, volume and PRs, timer phases and engine, timer → session link, FIT (real binary file), TCX, duplicate matching, backup round trip and migrations, analytics, Strava mapping and rate limits, the Cloudflare Worker.
- Offline check in headless Chrome with the network switched off: every screen loads and a Tabata timer runs on time. After freezing the page for 40 s (like a locked iPhone) the timer resumed at the exact right phase and second.

## Design update (2026-10-12)
- New look inspired by the Monday Resolution studio website: black background, yellow (#FDD70D) highlights, square corners, uppercase titles with a short yellow rule, uppercase buttons.
- Fonts: Archivo (titles) and Inter (text), bundled with the app so they work offline.
- Body map, heatmap and single-measure charts use yellow; two-period comparisons use yellow (current) vs gray (previous).
- App icon and favicon: the Monday Resolution symbol (used with permission).

## Sports and activity calendar (2026-10-12)
- Log any activity by hand (Today → “Log activity”, History → “+ Activity”, or from a day in the calendar): 38 sports in 8 groups — walking, running, trail running, hiking, cycling, mountain biking, swimming, kitesurfing, windsurfing, wakeboarding, surfing, SUP, kayak, downhill skiing, ski touring, cross-country skiing, snowboarding, sport climbing, bouldering, via ferrata, yoga, pilates, padel, tennis and more.
- Fields: duration, distance and elevation gain (when they make sense for the sport), effort, average/max heart rate, calories from a watch (optional, shown as “Entered”), notes. Live pace/speed and calorie estimate while typing.
- Calorie estimate per sport: speed-based MET for walking, running and cycling; extra intensity for steep climbs on foot and on skis.
- Muscle map for activities from the sport’s main muscles.
- History has a Calendar view: coloured bars per activity type on each day, active days per week, active days in the month and days per activity type; tap a day to see or add activities.
- Analytics: “Active days” and “Distance” tiles, distance in comparisons and totals, and an “Activity mix” chart (days per activity type per week or month).
- Garmin and Strava imports are recognised as the matching sport (e.g. Strava “BackcountrySki” → Ski touring) and appear in the calendar.

## Personal program and planning features (2026-10-13)
- Different targets per set: warm-up sets, pyramids and a last set “to failure” (max reps), also per interval in EMOM blocks. Shown in the timer (“Warm-up”, “Max reps”) and in the log (W = warm-up set).
- Note per exercise (e.g. “18% incline · 4 km/h”), shown in the log and on the timer.
- Optional blocks: marked “Optional”, with “Skip today” / “Include” on the workout screen. Skipped blocks are left out of “Run all”, calories and the log.
- “Log as done” for a whole program day (asks which optional blocks were done and when you finished) and “Mark block as done” on the workout screen — for classes like Body Pump where there is no time to log.
- Today: “Do another day of your program” to start or log any day, not only today’s.
- Program templates: “My training week” (Mon/Thu abs + incline walk, Tue/Fri legs & glutes, Wed Body Pump 55 min) and the sample week.
- New exercises: mobility routine, stretching routine, barbell warm-up, clean and press, split squat, lying leg raise, flutter kicks, plank shoulder tap. Incline walk now uses 8 MET (steep treadmill walking).
- Progress badges only compare like with like (weighted with weighted, bodyweight/timed with bodyweight/timed).
- Template update: real weights (RDL 16 kg, leg press 80 kg, cable kickback 8 kg, Body Pump bar 10 kg) and a generic “Abs (mixed exercises)” for the abs block.
