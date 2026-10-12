# Workout Tracker

A personal workout tracker that runs in the browser and installs on your iPhone home screen. Plan weekly programs, run them with a built-in interval timer (Tabata, AMRAP, EMOM, For Time, intervals, sets × reps), log every set, and follow your progress with charts, personal records, a muscle map and calorie estimates.

- **Free:** no paid services, no paid developer accounts.
- **Private:** all data stays on your device (IndexedDB). Nothing is sent anywhere, except to Strava if you connect it.
- **Offline:** after the first visit every screen, including the timer, works without a connection.
- Dark theme, built for iPhone first, with a wider layout on a Mac.

Contents: [Put it online (GitHub Pages)](#1-put-it-online-with-github-pages) · [Install on iPhone and Mac](#2-install-on-iphone-and-mac) · [Move data between iPhone and Mac](#3-move-data-between-iphone-and-mac) · [Garmin import](#4-import-garmin-activities) · [Strava setup](#5-strava-setup-optional) · [Good to know](#6-good-to-know) · [For developers](#7-for-developers)

---

## 1. Put it online with GitHub Pages

You need a free GitHub account. This takes about 10 minutes, once.

**A. Create a GitHub account** at <https://github.com/signup> if you don’t have one.

**B. Upload the project with GitHub Desktop** (a free app; no command line needed).

1. Download and install GitHub Desktop: <https://desktop.github.com>. Sign in with your GitHub account.
2. In GitHub Desktop choose **File → Add Local Repository…** and select this folder (`App Training`). It is already a Git repository with the full history.
3. Click **Publish repository**.
   - Name: `workout-tracker` (the app is set up for this name; another name also works, see the note below).
   - **Untick “Keep this code private”.** Free GitHub accounts can only publish Pages from public repositories. Only the app’s code becomes public — your workout data never leaves your devices.
   - Click **Publish Repository**.

**C. Switch on GitHub Pages**

1. Open your repository on github.com (GitHub Desktop: **Repository → View on GitHub**).
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.

**D. Wait for the first build**

1. Open the **Actions** tab of the repository. A run called “Deploy to GitHub Pages” builds, tests and publishes the app (about 2 minutes).
2. If that first run failed because Pages was not switched on yet, click the run → **Re-run all jobs** (or **Deploy to GitHub Pages → Run workflow**).
3. When it shows a green tick, your app is live at:

   **`https://YOUR-GITHUB-USERNAME.github.io/workout-tracker/`**

**Updating later:** every time changes are pushed to the `main` branch (GitHub Desktop: **Commit** then **Push origin**), the app is rebuilt and published automatically. Open the app and tap **Update** when it says a new version is available.

> **Different repository name?** The build reads the repository name automatically, so `https://YOUR-USERNAME.github.io/OTHER-NAME/` works too.

---

## 2. Install on iPhone and Mac

**iPhone (Safari)**

1. Open your app address in **Safari** (not Chrome — only Safari can install home screen apps on iPhone).
2. Tap the **Share** button (square with an arrow) → scroll down → **Add to Home Screen** → **Add**.
3. Open the app from the new icon once while online. From then on it works offline, also in flight mode.

**Mac**

- Safari (macOS Sonoma or newer): **File → Add to Dock**.
- Chrome or Edge: click the install icon at the right end of the address bar.
- Or just use it in a normal browser tab.

The app asks the browser to keep its storage permanently (“persistent storage”). Settings → Storage shows whether this was granted. On iPhone, installing to the home screen is the best protection against Safari clearing website data.

---

## 3. Move data between iPhone and Mac

Each device keeps its own data. To copy everything from one to the other:

1. **On the iPhone:** Settings → **Backup** → **Export backup…**. The share sheet opens:
   - **Save to Files → iCloud Drive** (keeps a copy in the cloud), or
   - **AirDrop** to your Mac.
2. **On the Mac:** open the app → Settings → **Import backup** → pick the `workout-backup-YYYY-MM-DD.json` file.
3. Choose **Replace data on this device** (the Mac becomes an exact copy) or **Merge** (keeps what is already on the Mac; when a workout exists on both, the most recently edited version wins).

The other direction works the same way. The Today screen reminds you to make a backup once a week.

Backups contain workouts, programs, your own exercises, the weight log, profile and settings. They never contain Strava passwords or tokens.

---

## 4. Import Garmin activities

Settings → **Import activities (Garmin)** → **Choose files**. You can select several `.fit` and `.tcx` files at once.

Getting the files from Garmin Connect (website): open an activity → gear icon (⚙) → **Export Original** (a `.zip` containing the `.fit` file — open the zip first) or **Export to TCX**.

What happens:

- A new workout is created with the duration, distance, calories, average and maximum heart rate, and a heart-rate chart.
- If you already logged the same workout in the app (start within 10 minutes and a similar duration), the watch data is **added to that workout** instead of creating a second one.
- Importing the same file twice does nothing (“Already imported”).
- Calories from the watch replace the app’s estimate and are labelled **Imported**.

Two example files are in the `samples/` folder if you want to try it.

---

## 5. Strava setup (optional)

Strava requires a secret key for logging in, and a web app cannot hide a secret. So the login goes through a tiny free **Cloudflare Worker** that you own. It only exchanges login codes for tokens and stores nothing. Your activities are then read directly by the app, and the tokens stay on your device.

You need: a Strava account and a free Cloudflare account. About 15 minutes.

**A. Create a Strava API application**

1. Go to <https://www.strava.com/settings/api> (logged in).
2. Fill in:
   - **Application Name:** e.g. `My Workout Tracker`
   - **Category:** e.g. `Training`
   - **Website:** your app address, e.g. `https://YOUR-USERNAME.github.io/workout-tracker/`
   - **Authorization Callback Domain:** `YOUR-USERNAME.github.io` (only the domain, no `https://`, no path)
3. Save. Note the **Client ID** (a number) and the **Client Secret** (click “show”). Keep the secret private.

**B. Create the Cloudflare Worker**

1. Sign up at <https://dash.cloudflare.com/sign-up> (free plan).
2. In the dashboard: **Workers & Pages → Create → Create Worker** (“Start with Hello World”). Name it `workout-tracker-strava` and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, then open the file `worker/strava-worker.js` from this project (any text editor), copy all of it, and paste it into the Cloudflare editor. Click **Deploy**.
4. Go back to the Worker → **Settings → Variables and Secrets** → **Add**:

   | Type   | Name                   | Value                                      |
   |--------|------------------------|--------------------------------------------|
   | Text   | `STRAVA_CLIENT_ID`     | your Client ID                             |
   | Secret | `STRAVA_CLIENT_SECRET` | your Client Secret                         |
   | Text   | `ALLOWED_ORIGIN`       | `https://YOUR-USERNAME.github.io`          |

   Click **Deploy** (or **Save and deploy**) after adding them.
5. Copy the Worker’s address shown at the top, e.g. `https://workout-tracker-strava.YOUR-SUBDOMAIN.workers.dev`.

**C. Connect in the app**

1. Open the app → Settings → **Strava** → tick **Enable Strava import**.
2. Paste the **Client ID** and the **Worker URL**.
3. Tap **Connect with Strava**, log in to Strava and tap **Authorize**.
4. Back in the app, choose a start date and tap **Import now**.

**On iPhone:** after authorizing, Strava may open the app in Safari instead of the installed app (they have separate storage). Safari then shows a **connection code**. Copy it, open the installed app → Settings → Strava → **Got a connection code instead?** → paste → **Connect**. The code is valid for a few minutes.

**Good to know**

- Strava activities are matched with workouts you logged in the app and with imported Garmin files, so the same workout is not counted twice.
- The app stays well below Strava’s request limits (it uses at most 80 requests per 15 minutes and 800 per day) and only reads data. Strava’s API terms allow this kind of personal use.
- **Disconnect** removes the tokens from the device and revokes the app’s access at Strava.
- To switch Strava off, untick **Enable Strava import**. To remove it from the app completely, add a repository variable `VITE_STRAVA` with the value `off` (GitHub → Settings → Secrets and variables → Actions → Variables); the next build leaves the Strava screens out. The Strava code lives only in `src/strava/`, and the rest of the app does not depend on it.
- Optional: instead of typing the Client ID and Worker URL on each device, add them as repository **variables** (GitHub → Settings → Secrets and variables → Actions → Variables): `STRAVA_CLIENT_ID` and `STRAVA_WORKER_URL`. The next build fills them in. (The Client ID is not secret; never put the Client Secret in GitHub.)

---

## 6. Good to know

- **Timer with the screen locked (iPhone).** The timer always shows the correct time, because it is calculated from the clock, not from ticks. While the timer runs the app keeps the screen on. If you lock the phone anyway, iOS may pause the web app; the app pre-schedules its beeps and keeps an audio session open to make them play, but iOS does not guarantee this for web apps. When you unlock, everything catches up immediately. For guaranteed beeps, leave the screen on.
- **Silent switch.** Beeps are set to play as media so they work with the ring/silent switch on, but they follow the media volume.
- **Calories are estimates** (MET method from the Compendium of Physical Activities, with your weight, height, age and sex). Values imported from Garmin or Strava are used instead when available. See Settings → Calories and BMR.
- **Apple Health** cannot be read by web apps. An extension point for importing the Health export file is prepared in `src/lib/importers/appleHealth.ts`.
- **Data lives per device.** Use Backup to copy it. If you delete the home screen app or clear Safari website data, the data on that device is gone — another reason for the weekly backup.

---

## 7. For developers

Requirements: Node.js 22. On this Mac it was installed without admin rights in `~/.local/node`; in a terminal run `export PATH=~/.local/node/bin:$PATH` first.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run dev` serves the app at <http://localhost:5173/workout-tracker/>. `npm run build` writes the static site to `dist/` (set `BASE_PATH=/` to build for a domain root).

Project layout:

| Path | What |
|---|---|
| `src/db/` | Data model (`types.ts`), Dexie database, profile/settings helpers |
| `src/data/exercises.json` | Built-in exercise catalog (150 exercises) |
| `src/lib/timer/` | Timer engine (pure, timestamp based), phase builder, audio, wake lock, session link |
| `src/lib/stats.ts` | Volume, Epley 1RM, PRs, progression |
| `src/lib/calories.ts` | MET table, calorie estimate, Mifflin-St Jeor BMR |
| `src/lib/analytics.ts` | Aggregations for the charts |
| `src/lib/backup.ts` | Backup export/import with schema versions and migrations |
| `src/lib/importers/` | FIT, TCX, Apple Health extension point, matching/merging |
| `src/strava/` | Optional Strava integration (isolated) |
| `worker/strava-worker.js` | Cloudflare Worker for the Strava token exchange |
| `tests/` | Vitest unit tests |

See `CHANGELOG.md` for what was built in each phase and `DECISIONS.md` for the choices behind it.
