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
- Template update: real weights (RDL 16 kg, leg press 80 kg, cable kickback 8 kg, Bulgarian split squat 8 kg, abduction 60 kg, adduction 30 kg, Body Pump bar 10 kg) and a generic “Abs (mixed exercises)” for the abs block.
- Log workouts on any date: “+ Workout” on a day in the calendar, “Log a past workout” on Today, the History button, and a Date field in every “Log as done”. Choose a program day (log as planned or enter the sets yourself), an empty workout, or a sport activity.

## Workouts instead of weekly programs (2026-10-13)
- The Programs tab is now **Workouts**: a flat list of saved workouts (no days of the week). Each workout can be started, or logged for today or any past day, straight from the list; tap it to edit its blocks.
- Existing programs are split automatically into one workout per day (same-name days kept once; the personal template's days are renamed Abs + cardio, Legs & glutes 1, Legs & glutes 2). Logged sessions are not affected. Backups from before are converted on import.
- Today: “Start a workout” (pick a saved workout or a free workout), “Log a workout”, “Log a past workout” and “Log a sport or outdoor activity”.
- Templates now add separate workouts: “My workouts” (Abs + cardio, Legs & glutes 1, Legs & glutes 2, Body Pump) and “Sample workouts”.
- Today has two buttons: “Start a workout” (pick a saved workout or a free one, with a date: today starts it live with the timer, a past date creates it on that day to fill in) and “Start a sport or outdoor activity” (also with a date).
- Workout screen: “Mark all as done (as planned)”; per-block “Mark block as done” only shows on blocks with open sets; the run-all timer button only on workouts in progress.

## Strava archive import (2026-10-13)
- Import the free Strava export (“Download your account” .zip, or its activities.csv) in Settings → Import activities: every activity becomes a session with its sport, time, distance, elevation, calories, heart rate and description. Uses the same ids as the Strava API (`strava:<id>`), so nothing is duplicated, and merges with workouts logged in the app.
- Note: Strava now gives API access (automatic sync) only to subscribers; the archive import works with a free account.

## New timer (2026-10-13)
- **Timer tab redesigned** after interval-timer apps for the gym: five big formats — AMRAP, For Time, EMOM, Tabata and Mix — each with a ⓘ button that explains how it works.
- **Simple setup:** a few big boxes per format (e.g. “[8] Rounds · [0:20] Work · [0:10] Rest”, “Every [2:00] for [12] min”); tapping a box opens the iPhone picker wheel. Optional sets with a rest between them for every format, “Signal every N min” for For Time, a get-ready countdown and the total time on the Start button. The last settings of each format are remembered on the device.
- **Mix:** chain AMRAP, EMOM, Tabata, For Time, single work periods (with a label, e.g. Plank) and rests into one flow, reorder them and repeat the whole flow.
- **Running screen:** the Monday Resolution circle draws itself as the time runs (yellow = work, blue = rest, white = get ready) and the full symbol with the X appears when you finish. Tap the circle to start, pause or resume; big “10 … 1” get-ready countdown and “GO”; “3/8 · Work” style heading; round counter with the last round time for AMRAP and For Time; “Show workout” lists every step with ✓ for those done and the round splits; Skip, Restart and Stop are small at the bottom.
- **Sounds like a gym timer:** three low beeps in the last 3 seconds, a long high beep when work or rest starts, a short double beep halfway through work periods of 20 s or more (can be turned off) and a short signal for For Time interval signals.
- **Music keeps playing:** by default the beeps now play on top of Spotify or Apple Music instead of pausing them (Settings → Timer → “Play with music”). On iPhone the beeps then follow the Ring/Silent switch.
- When the timer ran the whole workout, “Save workout” at the end saves it straight to your history (no more “Resume … timer” leftovers).
- Workout editor: For Time blocks have an optional “Signal every … min”.

## Timer refinements (2026-10-13)
- The Timer tab is now just a timer: start it, do the work, close it. Nothing is saved and there is no save question at the end (“Well done”, total time, Again / Close). To track a workout, run it from Workouts. A running timer survives a reload of the app.
- “Your workouts” removed from the Timer tab.
- No sound when the get-ready countdown starts: the long beep now marks only the start of work, after the three countdown beeps.
- The start/end beep is no longer cut short (a phase change used to stop the beep that had just started).
- Sounds are balanced to the same loudness (the start/end beeps were louder than the halfway signal) and each kind has its own volume in Settings → Timer, with a Test button.
- Halfway signal also in EMOM intervals.
- Voice guide (female or male, or off): “Get ready”, “Go!”, “Rest”, “Halfway”, “Ten seconds”, “Last round!”, “Workout complete”. Recorded clips, played like the beeps, so they work offline and with music.
- Rest is shown in pink.

## Timer voice and home layout (2026-10-13)
- Voice guide speaks like SmartWOD: “Let's go!” at the first round, “Round 2”, “Round 3”… (EMOM intervals too), “Last round!”, “Rest” between rounds, “Set rest” between sets, “Halfway there!” in the middle.
- Timer home: smaller centered buttons, yellow for AMRAP / For Time / EMOM / Tabata and pink for Mix, with the ⓘ beside each one; the format names are now smaller than the page title.
- Between sets of AMRAP / EMOM / For Time the heading reads “Set rest”.

## Home, Mix and voice polish (2026-10-13)
- The Today tab is now **Home**: two big centered buttons, “Start a workout” (yellow) and “Start an activity” (pink), above any workout in progress. The weekly backup reminder is no longer shown (backups stay in Settings).
- Every page title has a small Monday Resolution symbol instead of the yellow dash.
- The “new version” banner is pink with a dark Update button.
- Mix setup: timers are big centered buttons like on the Timer home (yellow; Rest pink; Work white) with an × on the right to remove them. Tap one to edit it; hold it for a moment and drag it up or down to reorder (the arrows are gone).
- The voice always says “Well done!” at the end. Fixed: a voice cue that starts a few tenths after its beep could be dropped when the phase changed (this could also silence “Rest”, “Round 2” and the others).

## Start sheets, opening screen and loader (2026-10-13)
- Opening screen: the MORE · Monday Resolution logo on black for 3 seconds when the app starts, then it fades out.
- Loading: the Monday Resolution circle drawing itself replaces the “Loading…” text.
- Home: shorter hint under the buttons (“Change the date to log a past one.”).
- Start a workout: only the date (today by default) and a plain list of workout names plus “Free workout”. No start time is asked for past dates.
- Start an activity opens a sheet too: date (today by default), a search bar and two lists, Type and Sport. Picking a sport fills in its type; picking a type narrows the sports; a search result fills in both. Choosing the sport opens the activity form for that day. The activity form uses the same picker (with “Change”) and asks only for the date, not the time.
- Date fields no longer stick out of their box on iPhone.
- Activity picker: the lists are one under the other and are called “Activity category” and “Activity”; the search bar shows only a magnifying glass.
- The “new version” banner is black with a yellow border and yellow buttons.

## Workouts library: exercises, exercise templates, workout templates (2026-10-13)
- **Workouts** is now the place to prepare everything, with three big buttons (and an ⓘ each): **Workout templates**, **Exercise templates** and **Exercises** (the catalogue with muscles and history). Workouts are started from Home.
- **Exercise templates** (new): ready-made parts of a workout — one or more exercises with their format (sets × reps, EMOM, Tabata…), sets, reps, weights, rest and timer. Create them from scratch, or save any part of a workout with “Save as exercise template”.
- **Workout templates**: add parts “From template” (one tap) or as a “New part” in any format. Parts are big buttons like the Timer's Mix: tap to edit, hold and drag to reorder, × to remove. Exercises inside a part are reordered the same way.
- Everything can be duplicated: copy icon in each list, Duplicate on each page, Duplicate on each part.
- Same look as Home and Timer everywhere in Workouts: big centered buttons, plain lists, search with a magnifying glass, ⓘ explanations. The “Start / Log” buttons were removed from Workouts (use Home → Start a workout, also for past days).
- Exercise templates are included in backups (older backup files still import).
- Fixed: sometimes an empty strip appeared under the bottom bar when the app opened on iPhone; the bar now covers it.

## Exercise blocks (2026-10-14)
- “Exercise templates” are now called **Exercise blocks**.
- New, simpler block editor in numbered steps: 1. pick exercises from the catalogue; 2. with several, choose how they are combined (in sequence, alternating, circuit); 3. count by reps (sets, rest) or by time with a timer (timed sets, Tabata, AMRAP, EMOM, For Time — same big boxes as the Timer tab); 4. reps and weight per exercise (with optional different targets per set); then block notes and an Optional tick. The block name fills in from the exercises. Rare settings (drop sets, custom intervals) are under “Advanced settings”.
- **Blocks are linked to workouts**: change a block once and every workout template that uses it is updated, from the next session on. Workouts already done never change. In a workout, linked blocks show a link icon and open the block; “Add a block” adds one from the library, “New block” creates one and opens it. Older parts can be linked with “Save as exercise block”.
- Exercise blocks list: filters by category (All, Strength, Bodyweight, Cardio, Mobility) and muscle group under the search.
- Workouts page: one short ⓘ that explains Exercises, Exercise blocks and Workout templates; more detail in the ⓘ of each page.
- The “new version” banner appears only on Home, at the bottom just above the tab bar.
- Renamed again: **Training blocks** (instead of Exercise blocks) and **Workouts** (instead of Workout templates).
- The Optional tick was removed from training blocks: to skip a block, remove it from the workout while you do it.
- Removed example texts from the app (hints, placeholders and ⓘ texts) and the explanation in brackets after “Different targets per set”.
- Training blocks: “Count by → Time” offers only the Timer tab's timers (AMRAP, For Time, EMOM, Tabata). “Timed sets” is no longer offered for new blocks; blocks that already use it keep working.
- Fixed for good: the grey strip under the tab bar (and under the opening logo) on iPhone. The app background is now pure black, the same as the tab bar and the opening screen, so the space iPhone sometimes leaves below the app is invisible.
- Timer home: one ⓘ at the top (same place as on Workouts) with a short summary of the timers; the detailed explanations stay in the ⓘ inside each timer. The format buttons are now centered without side icons.
- Workouts page: buttons in the order Exercises, Training blocks (yellow), Workouts (pink), without counts.

## Automatic sync between devices (2026-10-14)
- Settings → **Sync**: turn it on with a new sync code on one device, then join with the same code on the others. Data then stays the same everywhere: workouts, training blocks, sessions, activities, custom exercises, weight log and profile.
- Syncs on opening, when the app comes back, a few seconds after each change and every 5 minutes; “Sync now” button, status (synced / syncing / error), show and copy the code, turn off on one device, delete the cloud copy.
- End-to-end encrypted: only encrypted data reaches the server (a free Cloudflare Worker with KV storage, `sync-worker/`).
- Conflicts: the newest change of each item wins; deletions are carried to the other devices.
- The sync server is live on the owner's free Cloudflare account (workout-tracker-sync.alicevrs.workers.dev); Settings → Sync can now be turned on.


## Saved timers (2026-10-14)
- Workouts page: new yellow **Timers** button between Exercises and Training blocks.
- Timers: save preset Tabata, AMRAP, EMOM and For Time timers with their rounds, minutes and rests (Tabata also with sets). Same big boxes as the Timer tab; the name fills in from the settings until you type your own. Search, duplicate and delete like the other libraries.
- Training blocks: under “Count by → Time”, pick a **Saved timer**. The block uses it with its own exercises, reps and weights, and follows every later change to the timer (and so do the workouts that use the block, from the next session). “Open timer” edits it; “Set the timer here” sets the times in the block instead.
- Deleting a timer keeps the current times in the blocks that used it.
- Saved timers are included in sync and backups.
- **Sets for AMRAP, EMOM and For Time** in saved timers and training blocks (“Add sets”, with the rest between sets), as in the Timer tab. When a workout starts, each set becomes its own part (“· set 2/3”) with a “Set rest” before it, so the timer, results and history work set by set.

## Save button and list actions (2026-10-14)
- Workouts, training blocks and timers are no longer saved automatically. Changes are kept only when you tap the yellow **Save** button (always in view at the bottom; greyed out when there is nothing to save). Going Back with unsaved changes asks first, then discards them.
- **New workout / New block / New timer** appear in their list only after the first Save.
- In a workout, **New block** opens the new block; it is added to the workout when the block is saved. Opening a block from a workout (or a timer from a block) and coming back keeps the changes not yet saved there.
- Lists of workouts, training blocks, timers and exercises: a **×** to delete next to the copy icon to duplicate (built-in exercises can only be duplicated). Duplicates appear in the list right away.
- The Duplicate and Delete buttons inside workouts, blocks, timers and exercises were removed (they are in the lists now).
- **Timers from your training blocks:** once, when the new version opens, every training block counted by Tabata, AMRAP, EMOM or For Time gets a saved timer with its own settings (blocks with the same settings share one) and is linked to it, so the timers you already use are in Workouts → Timers without typing them again.

## Filters, “where used” and editable exercises (2026-10-14)
- Timers list: filter by type (All, AMRAP, For Time, EMOM, Tabata) under the search.
- Training blocks list: a second filter row for how the block is counted (All, Reps, AMRAP, For Time, EMOM, Tabata), combined with the category and muscle-group filters.
- New **link** icon in the lists: for an exercise or a timer it shows the training blocks that use it; for a training block, the workouts that use it. Each name opens that item.
- Every exercise, built-in ones included, can now be edited (Edit on the exercise page) and deleted (× in the list). A deleted built-in exercise disappears from lists and pickers, but past workouts still show its name. Changed and deleted built-in exercises are kept when the catalogue is updated and are synced to the other devices.

## Cleaner lists (2026-10-15)
- The link icon is faded when the item is not used anywhere (an exercise or timer in no training block, a block in no workout).
- Link, duplicate and × are closer together at the right edge.
- Lists show less: timers and training blocks only their name (no type tag, no second line); exercises without the muscles/equipment line; workouts only their approximate duration.
- Exercises: the “Mine” tag and the “Mine” filter were removed. Every exercise, yours included, belongs to the category chosen when it is created (Strength, Bodyweight, Cardio, Mobility).

## Minutes and seconds in timers (2026-10-15)
- Every time box (AMRAP time, For Time cap, EMOM interval and length, Tabata work and rest, rest between sets, Mix work/rest items, rest in training blocks) now shows minutes:seconds. Tap the part before the colon to pick the minutes, the part after it to pick the seconds (5 s steps): any time such as 2:40 takes two taps.
- Labels show times with seconds where needed (“2:40 min”).

## Duplicate opens a copy to edit (2026-10-15)
- The copy icon in the lists no longer adds a copy right away: it opens the copy (workout, training block, timer or exercise) with all the settings of the original. Change what you like and tap Save; leave without saving and nothing is added.
- A copied timer whose name was made from its settings keeps an automatic name, so it follows the copy's new settings.
- Fixed: the Save button could cover settings when a page got longer (for example after Add sets). It now always sits below the content of the page.

## Simpler filters (2026-10-15)
- Exercises, timers and training blocks (and the exercise picker): the “All” chip is gone. No yellow chip = no filter; tap a chip to filter, tap it again to remove the filter.
- Training blocks: the “Reps” chip was removed; the second row filters by timer only (AMRAP, For Time, EMOM, Tabata).
- Empty leftover blocks (“New exercise block” / “New training block” with no exercises, not used by any workout), created by New block before blocks needed a Save, are removed when the app opens.

## Weight × time (2026-10-17)
- Exercises: “Logged as” now has three options: **Weight × reps**, **Weight × time** and **Time and distance**. Weight is optional in both weight options (leave it empty for bodyweight), so timed exercises with a weight can be tracked and compared by weight.
- Exercises that were “Reps (bodyweight)” are now Weight × reps; those that were “Time” are now Weight × time (built-in catalogue and your own exercises).

## Count by follows the exercises (2026-10-17)
- Training blocks: the Reps / Time switch is gone. How a block is counted comes from “Logged as” of its exercises: Weight × reps → count by reps (sets, reps, rest); Weight × time or Time and distance → count by time with a timer (AMRAP, For Time, EMOM, Tabata or a saved timer).
- The first exercise decides; after that, “Add exercise” lists only exercises of the same kind.
- Timed exercises in AMRAP, For Time and EMOM blocks get a time per round / interval instead of reps.
- Existing blocks that do not match (e.g. a timer with exercises logged by reps) keep working as they are; their page shows a notice with a button to switch.

## Sheets above the keyboard (2026-10-17)
- On iPhone, a sheet with a search box (such as Add exercise in a training block) now moves above the keyboard and fits the space that is still visible, so the results are not hidden under the keyboard. Applies to every sheet in the app.
- Training blocks: under a chosen saved timer only the Open timer button remains (no repeated description, no extra note).
- Training blocks counted by time: step 3 is now **Weight and reps**. The time comes from the timer, so there is no time field; per exercise you set the weight and, optionally, the approximate reps per round or interval. Those reps count in the volume (also for Tabata rounds, which used to log no reps).

## Training block editor, simpler (2026-10-17)
- “Advanced settings” removed from training blocks.
- Exercise rows: the × is at the right edge, with a pencil next to it that opens the exercise (see it, Edit it); Back returns to the block with its unsaved changes.
- A chosen saved timer now shows as a yellow row like the exercises, with a pencil to open (and change) the timer and a × to remove it; the timer list appears again after removing it. The separate Open timer button is gone.
- Training blocks with exercises logged by reps can again use a timer: pick a **saved timer** (for example an EMOM, which then sets how many sets you do, with reps and weight per interval), or choose “None: set sets and rest here” to set sets and rest by hand. Exercises logged by time still always use a timer.
- “Different targets per set / interval”: when it is on, the exercise's own reps and weight above show “none” and are greyed out, because every set or interval below has its own. In an EMOM it now creates one row for every interval of that exercise (instead of 4). Turning it off puts the first row's values back.
- Exercise form: a live body map under the muscle list shows the chosen muscles (primary bright, secondary darker) and updates at every tap.
- Reps can be “none”, like weight: in training blocks (and per set / interval) the reps fields show “none” when empty, and pressing − below 1 empties them. The same goes for weight below the first step.

## Saved timers in the Timer tab (2026-10-17)
- Timer tab: after choosing AMRAP, For Time, EMOM or Tabata, a menu at the top lists your saved timers of that type. Picking one fills in its settings, ready for Start timer. The menu shows the saved timer whose settings match the current ones; changing a value afterwards changes only this run, not the saved timer.

## No optional parts (2026-10-18)
- “Optional” is gone everywhere: no Optional tag in workouts and sessions, no Optional setting for parts, and “Log a past workout” no longer asks which optional blocks were done (it logs every part as planned).
- During a workout every part has **Skip today** (tap again to include it), so you decide on the day what to leave out.
- Workout parts: the link icon after a part's name stays on the line of the last word instead of wrapping onto a line of its own.

## Time × distance targets (2026-10-18)
- Exercises: “Time and distance” is now called **Time × distance**.
- Training blocks: for Time × distance exercises step 3 asks **Incline (%)** and **Speed (km/h)** instead of weight and reps. The timer shows them next to the exercise while you train.
- The reps field of timed blocks is now just “Reps” (no “approx.”).
- Time × distance exercises in training blocks also have a **Distance (km)** target, next to incline and speed (shown in the timer too).

## Log as moves to the training block (2026-10-18)
- “Logged as” is no longer set on the exercise. It is now step 2 of a training block, **Log as**: Weight × reps, Weight × time or Time × distance. It decides how the block is counted and which targets it asks for, and the workout log shows the matching columns.
- Existing training blocks and workout parts got the Log as of their first exercise automatically, so nothing needs to be redone.
- Add exercise: the search box starts empty every time (the previous search is not kept), and the list shows all exercises again.
- Training blocks: **How they are combined** (in sequence, alternating, circuit) can now be chosen with every Log as and every timer, and it comes right after the exercises, before Log as. With a timer it records the order to follow; the timer itself is unchanged.
- Workouts list: “Add sample workouts” removed. New workout builds a workout; below is the list of your workouts.

## Exercise animations and muscle filter (2026-10-18)
- Every exercise page now starts with a small looping animation of the movement: a stylised yellow figure in the app's style, with the equipment (barbell, dumbbells, bench, bar, cable…) in pink. Sideways movements (lateral raises, hip abduction/adduction, jumping jacks…) are shown from the front. Your own exercises get the animation of a similar movement when their name makes it clear (for example a name containing “squat” or “curl”).
- Add exercise (in training blocks): a muscle group menu under the category filters.

## Lists remember where you were; equipment filter (2026-10-18)
- Exercises, training blocks, timers and workouts lists keep their search, filters and scroll position when you open an item and come back (while the app stays open).
- Every page now opens from the top (an exercise page used to open scrolled down, hiding its animation).
- Exercises list and Add exercise: an **All equipment** menu to filter by equipment (dumbbell, barbell, cable, machine…), listing the equipment the exercises actually use.
- Lists keep search, filters and position **only** when you come back from one of their own items (open an exercise, Back). Coming from another section starts the list fresh.

## History is for looking back (2026-10-18)
- History no longer has buttons to add a workout or an activity (neither at the top nor under a day of the calendar). Add them from Home → Start a workout / Start an activity, where you can choose the date.

## Sequence, circuit and swipe back (2026-10-18)
- Training blocks: **How they are combined** has two options. **In sequence** = go through the exercises one after the other, rest, and repeat for each round. **Circuit** = a set routine done as a whole, like a choreographed class. “Alternating” was removed.
- Existing training blocks with several exercises that were set as straight sets or alternating now go round the exercises like the new “In sequence”, keeping their sets and rest (their workouts follow).
- During a workout a **Circuit** block shows its exercises and one **Circuit done** button that logs them all as planned (Undo to take it back).
- Training block editor: swipe the page to the right to go back (the Back link stays; unsaved changes are asked about first).

## History: periods, swipe and filter (2026-10-18)
- Calendar: **Week, Month, Quarter, Year** views (quarter and year as small months with one coloured square per day). Swipe left or right on the calendar to go to the next or previous period.
- List and calendar: a menu to show only one workout (by name, e.g. all sessions of the same saved workout) or one kind of activity (by sport: running, hiking, wakeboarding…, whatever the activity was called on Strava).
- List: the “Timer” tag was removed; the Strava tag stays.
