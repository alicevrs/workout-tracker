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
