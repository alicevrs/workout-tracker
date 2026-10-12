import { describe, expect, it } from 'vitest';
import { LIMIT_15MIN, LIMIT_DAY, mapStravaActivity, rateLimitWait } from '../src/strava/api';

describe('Strava', () => {
  it('maps an activity to the shared import shape', () => {
    const a = mapStravaActivity({
      id: 42,
      name: 'Evening Run',
      sport_type: 'TrailRun',
      start_date: '2026-09-20T17:00:00Z',
      elapsed_time: 3700,
      moving_time: 3500,
      distance: 10230.5,
      average_heartrate: 151.6,
      max_heartrate: 178,
      calories: 702,
    });
    expect(a).toEqual({
      source: 'strava',
      externalId: 'strava:42',
      name: 'Evening Run',
      activityType: 'trail_run',
      startTime: new Date('2026-09-20T17:00:00Z').getTime(),
      durationSec: 3500,
      elapsedSec: 3700,
      distanceM: 10230.5,
      calories: 702,
      avgHr: 152,
      maxHr: 178,
    });
  });

  it('stays under the 15-minute and daily request limits', () => {
    const now = 10 * 86_400_000;
    expect(rateLimitWait([], now).ok).toBe(true);
    const burst = Array.from({ length: LIMIT_15MIN }, (_, i) => now - i * 1000);
    expect(rateLimitWait(burst, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/15 minutes/) });
    expect(rateLimitWait(burst, now + 16 * 60_000).ok).toBe(true);
    const day = Array.from({ length: LIMIT_DAY }, (_, i) => now - 20 * 60_000 - i * 60_000);
    expect(rateLimitWait(day, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/Daily/) });
  });
});
