// Address of the sync Worker (sync-worker/, deployed to the owner's free Cloudflare account).
// VITE_SYNC_URL overrides it at build time (e.g. http://localhost:8787 with `wrangler dev`).
export const SYNC_URL: string = (import.meta.env.VITE_SYNC_URL as string | undefined) ?? 'https://workout-tracker-sync.alicevrs.workers.dev';
