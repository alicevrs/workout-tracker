// Single entry point for the optional Strava feature. The rest of the app only imports from here.
import { lazy } from 'react';
import { STRAVA_FEATURE } from './config';

export { STRAVA_FEATURE };
export const StravaPanel = STRAVA_FEATURE ? lazy(() => import('./StravaPanel')) : null;
export const StravaRedirectNotice = STRAVA_FEATURE ? lazy(() => import('./RedirectNotice')) : null;

/** True when the page was opened by Strava's OAuth redirect. */
export function isStravaRedirect(): boolean {
  const p = new URLSearchParams(window.location.search);
  return STRAVA_FEATURE && (p.has('code') || p.has('error')) && p.has('state');
}
