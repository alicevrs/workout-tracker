/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_STRAVA?: string;
  readonly VITE_STRAVA_CLIENT_ID?: string;
  readonly VITE_STRAVA_WORKER_URL?: string;
}
