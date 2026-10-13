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

## Calories
- **kcal = MET × kg × hours.** MET values (`src/lib/calories.ts`, shown in Settings) are approximations from the Compendium of Physical Activities: resistance training 3.5 / 5.0 / 6.0 (light / moderate / vigorous), calisthenics 2.8 / 3.8 / 8.0, circuit (AMRAP, EMOM, For Time) 3.5 / 4.3 / 8.0, intervals (Tabata, intervals) 4.0 / 6.0 / 8.0, stretching 2.3 / 2.3 / 3.0. Cardio exercises carry their own MET (e.g. running 9.8), scaled × 0.75 for light and × 1.3 for vigorous.
- The block type decides the MET; a block where most exercises are cardio or mobility uses those METs instead.
- Time per block: blocks run with the timer use their measured time; the rest of the workout time (including rests and warm-up) is shared by the other blocks in proportion to their planned duration.
- Body weight = the weight-log entry closest to the workout date (before or after); if the log is empty, the profile weight. Without any weight, no estimate is shown (the UI asks for a weight instead of guessing).
- Imported calories always replace the estimate and are labelled “Imported”.
- **Daily total** = BMR + exercise calories *above resting* (gross minus 1 MET for the workout time), so the resting part is not counted twice.
- Age for BMR is calculated from the birth date at each date; if only an age is entered, it is used as is.

## Analytics
- Charts use one validated categorical palette (blue first, orange second), checked for colour-blind separation and contrast against the dark card surface. Single-measure charts use one colour; two measures with different units are never put on one axis.
- “This week / month / year” in comparisons runs up to today and is compared with the *whole* previous period. The running-total chart shows whether you are ahead of last period’s pace.
- The muscle donut shows the top 7 muscles plus “Other”; the bar view lists all of them.
- Weekly streak = consecutive weeks with at least one workout, counting the current week only once it has a workout.

## Backup
- **Format:** `{ app: "workout-tracker", schemaVersion, exportedAt, data: { exercises, programs, sessions, bodyWeights, profile, settings } }`. Only custom exercises are included (the catalog ships with the app).
- **Migrations:** `MIGRATIONS[n]` upgrades a version-n file to n + 1; imports run the chain up to the current version, then fill missing fields with defaults and drop records that are clearly broken (instead of failing the whole import). The current format is version 1. A file from a newer app version is refused, with a message to update the app first.
- Backups never contain Strava tokens or device-only settings (last backup date, reminder, storage request).
- On iPhone the export uses the Web Share API with a file (share sheet → Save to Files / AirDrop). Everywhere else, and as a fallback, the file is downloaded.
- Reminder: shown on Today when the last backup (or “Later”) is more than 7 days ago; someone who never backed up is reminded once their oldest workout is a week old.
- On iPhone the file pickers don’t restrict file types, because iOS greys out `.fit`/`.json` files when an `accept` filter is used.

## Imports
- All importers produce the same `ImportedActivity` shape; matching and saving are shared (`src/lib/importers/apply.ts`). Adding a source = one parser.
- **Duplicate rule:** same external id (e.g. `strava:123`, `fit:<start>:<duration>`) → already imported. Otherwise a session that started within **10 minutes** and has a duration within **20 % or 5 minutes** is the same workout: imported values are added to it (calories, heart rate, distance, the external id), but logged sets, title and notes are never changed. Values already present are not overwritten.
- FIT files can contain several sessions (multisport); each becomes its own activity. Heart-rate samples are downsampled to at most 600 points.
- TCX average heart rate is weighted by lap time.

## Strava
- OAuth “authorization code” flow. The Cloudflare Worker exchanges the code and refreshes tokens with the client secret; it returns only the tokens and the athlete’s id and first name, checks the `Origin` header against `ALLOWED_ORIGIN`, and stores nothing.
- The app calls the Strava API directly with the access token; if the browser blocks that call, it retries through the Worker’s read-only `/api/` pass-through.
- Rate limits: the app keeps its own request log and stops at 80 requests per 15 minutes and 800 per day (Strava’s read limits are 100 and 1,000). Activity details (needed for calories) are fetched only for activities not imported before, at most 30 per sync.
- Redirect back to the app: `https://<user>.github.io/<repo>/?code=…&state=…`. If the `state` does not match (the redirect opened in Safari instead of the installed app, which has separate storage), the app shows the code to paste into the installed app instead of failing.
- Requested scope: `read,activity:read_all` (read only; includes private activities).

## Design
- Style follows the Monday Resolution website (colours, square shapes, uppercase headings), without copying its logo or images. The gym's own headline font is commercial, so the free Archivo is used instead; fonts are self-hosted (`@fontsource`) because the app must work offline and send nothing to third parties.
- Timer phase colours: **yellow (brand) = work**, pink (#efa3b3, taken from the user's pink Monday Resolution print) = rest, white = get ready. Work used to be green; it became yellow when the timer ring turned into the Monday Resolution circle, so the symbol draws itself in its own colour.
- With the owner's consent, the app uses the Monday Resolution symbol (yellow circle with an X) as favicon, sidebar logo and app icon. The PNG icons in `public/` were rendered from that SVG on the black background (the earlier dumbbell icon generator was removed).

## Sports and the activity calendar
- Activities are normal sessions without blocks, with `activityType` = a sport id from `src/data/sports.ts`. Imports keep working because every sport lists the Garmin and Strava type names it matches.
- Sport METs are moderate-effort values based on the Compendium of Physical Activities. Walking, running and cycling use speed tables when distance and time are given. For foot and snow sports, climbing adds +1 MET per 200 m of gain per hour (max +4). Ski touring uses 7 MET as its base because the logged time includes the descent.
- Calories typed in by hand are stored like imported ones but labelled “Entered” (`calorieSource: 'manual'`).
- Calendar colours are by activity group (8 groups + gym in brand yellow), always shown together with text labels.
- A day counts as “active” if it has at least one completed session. In the activity mix a day with two different activity types counts once for each.

## Personal program (“My training week”)
- Abs: modelled as a Tabata-type block — 4 rounds × 40 s, 0 s rest between rounds, 3 extra sets, 20 s between sets. The exercises change from session to session, so the block uses one generic exercise, “Abs (mixed exercises)”.
- Hip thrust “EMOM 2 × 12” is read as *every 2 minutes for 12 minutes* (6 intervals), which matches the 6 sets described (1 warm-up 60 kg × 15, 4 × 8 at 100 kg, 1 to failure at 100 kg).
- Bulgarian split squat, cable kickbacks and abduction/adduction use Intervals blocks so each minute is labelled with the leg or the machine.
- Body Pump: one timed block with the 10 usual tracks of a 55-minute class (warm-up, squats, chest, back, triceps, biceps, lunges, shoulders, core, cool-down) and approximate durations and reps; releases change every quarter, so the content is an approximation. Barbell tracks use a 10 kg bar.
- “Log as done” records blocks exactly as if the timer had run them as planned (same code path as the timer), with rep-based sets counted as 40 s each.
- Weights in the template: RDL 16 kg, leg press 80 kg, cable kickback 8 kg, Bulgarian split squat 8 kg, abduction 60 kg / adduction 30 kg, Body Pump bar 10 kg, hip thrust 60 kg warm-up / 100 kg working sets, glute bridge and back extension 10 kg.

## Workouts (replacing weekly programs)
- A saved workout is stored as a `Program` with exactly one day, so sessions keep their `programId`/`programDayId` links and backups stay compatible. The weekday field is no longer used.
- `migrateProgramsToWorkouts` runs at startup and after a backup import: multi-day programs are split into one workout per day; days with the same name are kept once; the first workout keeps the original program id and every workout keeps its original day id.

## Strava without a subscription
- Strava restricts its API to paying subscribers, so the free route is the account archive. Only `activities.csv` is read (with `fflate`, a small zip library): it already has the summary values, and parsing hundreds of original files on a phone would be slow. Strava writes dates in UTC and repeats some column names; the first “Elapsed Time” is seconds and the second “Distance” is metres.
- Activities where someone else tagged the user are in the archive only if the tag was accepted on Strava.

## Timer redesign (SmartWOD-style)
- Timer home: centered format buttons (yellow; Mix in the rest pink) with the ⓘ to the right of each, smaller than the page title, as asked by the user.
- Model: the user's reference video of SmartWOD (setup with a few big values, tap-the-circle start/pause, round counter, workout list, beeps). Only the concept is reused; layout, colours and texts are the app's own, following the Monday Resolution style.
- **Quick timers are ordinary blocks.** `src/lib/timer/quick.ts` turns the Timer-tab settings into blocks, so the existing engine, logging, calories and history work unchanged. Sets of AMRAP / EMOM / For Time become repeated blocks with a new `timer.restBeforeSec` (a rest phase before the block); Tabata keeps its own extra sets. In a Mix only the first block has a get-ready countdown; a Rest item becomes the rest before the next block and a trailing rest is dropped. “Repeat” duplicates the blocks.
- **Pickers are native `<select>` elements** styled as big boxes: on iPhone they open the system wheel (as in the reference app), on a Mac a list. Fixed value lists (seconds in 5 s steps up to 1 min, then 15 s and 30 s steps; minutes 1–60 then by 10).
- The last settings per format and the get-ready time are remembered in `localStorage` (a per-device convenience, not workout data).
- **Ring:** the brush circle from the logo is used as an SVG mask target: a thick circle stroke revealed clockwise from the brush's tail (top-left, −125°) uncovers the real logo shape, so the progress looks hand-painted. A faint copy is the track, the X stays very faint behind the digits and appears fully only on the finished screen. An open-ended For Time redraws the circle every minute.
- **Sounds** were measured from the reference video: 440 Hz beeps of about 0.5 s at −3, −2, −1 s and a 1040 Hz beep of about 0.75 s at every phase change (also at the end, a little longer), and a short 1400 Hz chirp halfway. The app uses the same pitches. Halfway is skipped for EMOM intervals and work shorter than 20 s. No voice: speech synthesis on iPhone is unreliable in the background and talks over music.
- **Music (Spotify) and the iPhone audio session:** Safari's `navigator.audioSession.type = "playback"` (used before) is exclusive, so iOS paused Spotify. Default is now `"ambient"`, which mixes with other apps' audio. Trade-off, explained in Settings: in ambient mode the beeps follow the Ring/Silent switch and the silent keep-alive audio is not used. Turning “Play with music” off restores the old loud, exclusive mode. Web apps cannot lower (“duck”) other apps' music, so there is no ducking option.
- Round counter: each tap stores the AMRAP/For Time phase time, giving “Last round” and the splits in “Show workout”; the total still goes to the block result as before. “Remove last round” in the list undoes a wrong tap.
- When a timer run covered every block of a workout in progress, “Save workout” on the finished screen marks it completed (same as Finish workout). Partial runs still return to the workout screen.
- **Timer-tab timers are not logged** (user's choice: “launch the timer, do it, done”, like SmartWOD; structured tracking happens in Workouts). The quick timer runs `TimerScreen` in `standalone` mode on an in-memory session that is never written to the database; it is kept in `localStorage` (`quickTimer:active`) only so a reload can resume a running timer. “Your workouts” was removed from the Timer tab for the same reason (Workouts is the place to start them).
- **Sounds, round 2:** the get-ready countdown starts silently and the long beep marks only the start of work/rest (as in SmartWOD). A phase change used to cancel and reschedule every sound, which stopped the beep that had just begun; now sounds that already started always play to the end. Tones were rebalanced by ear to one loudness (sine/triangle instead of square waves) and grouped (countdown, start/end, signals, voice), each with its own volume on top of the overall volume. Halfway now also plays in EMOM intervals.
- **Voice guide:** short clips recorded with the macOS voices Samantha (female) and Daniel (male) via `say` and converted to AAC (`public/voice/*.m4a`, ~160 KB, precached for offline use). They are scheduled on the audio clock like the beeps, so they keep time and mix with music in the same way. The browser's speech synthesis was not used: it cannot be scheduled ahead, is unreliable in the background on iPhone and uses its own audio session. Cues (SmartWOD wording): Get ready; “Let's go!” at round 1, “Round 2” … “Round 40” (recorded up to 40, later rounds say “Go!”), “Last round!” at the last round of each set (Tabata, intervals, EMOM intervals); “Rest” between rounds, “Set rest” between sets (Tabata set rest and `timer.restBeforeLabel = 'Set rest'` on repeated quick-timer sets; a Mix Rest item says “Rest”); “Halfway there!”; “Ten seconds” (work of 30 s or more); “Go!” for sets × reps; “Workout complete. Well done!”. The voice starts 0.3 s after the beep of the same moment.
- **Silent mode + music cannot both work in a web app on iPhone.** Safari only offers audio-session types that either follow the silent switch and mix with music (“ambient”) or ignore the switch and stop other music (“playback”); a native app like SmartWOD uses an option (“mix with others” on the playback category) that web apps cannot set. Both modes stay available in Settings. The only way to get both would be a native iPhone wrapper of this app (e.g. Capacitor), which needs Xcode and an Apple developer account; not done.

## Home and shared look
- “Today” renamed **Home** (route stays `/`). The weekly backup reminder banner was removed at the user's request; `backupReminderDue` remains in `lib/backup.ts`, unused by the UI, and Settings still shows the last backup.
- Big centered buttons (`.big-btn`, yellow; `.pink` uses the rest pink) are the shared style for Home, the Timer home and the Mix list; corners stay square like the rest of the app.
- Page titles show the Monday Resolution symbol (`/favicon-mr.svg` as a CSS background, Vite adds the base path). Card titles keep the thin yellow rule.
- Mix reordering: hold 350 ms then drag (pointer events; scrolling is blocked only while dragging with a non-passive `touchmove` listener; moving more than 8 px before the hold ends counts as scrolling). Keyboard: Alt + ↑/↓ on a focused item.
- Audio scheduling keeps every sound whose moment has come (not only those already audible), so voice cues delayed 0.3 s behind their beep survive the reschedule at a phase change. The final cue is “Well done!”.

## Opening screen, loader and start sheets
- **Opening screen** copies the gym app's “MORE · Monday Resolution” splash (from the user's reference video; the gym's branding is used with the owner's consent, the “powered by” vendor mark is not). It is an inline SVG in `index.html`, so it appears before any script loads: the letters are outlines of the free Anton font (converted to paths once with opentype.js, no font file shipped), stretched to the original proportions, with the symbol from `favicon-mr.svg`. `main.tsx` removes it 3 s after the page started loading.
- **Loader** (`BrandLoader`): the brush circle revealed and hidden in a loop with the same mask technique as the timer ring.
- **Past dates without a time:** a workout or activity on a past day is saved at 12:00; today's activity defaults to one hour ago. Editing an existing activity's date keeps its original time (imports have exact times).
- **Sport picker:** a search box plus native `<select>` lists (wheels on iPhone): Type (sport groups, gym excluded) and Sport (alphabetical, filtered by type). Selecting a sport sets the type; changing the type does not clear the search.

