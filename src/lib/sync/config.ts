// Address of the sync Worker (sync-worker/). Empty = sync not set up yet.
// VITE_SYNC_URL overrides it at build time.
export const SYNC_URL: string = (import.meta.env.VITE_SYNC_URL as string | undefined) ?? '';
