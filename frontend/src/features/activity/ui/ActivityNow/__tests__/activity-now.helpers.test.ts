import { describe, expect, it } from 'vitest';
import type { ActivityChange, ActivityHourBar, ActivityNowView } from '../../../activity-source/activity.types';
import {
  describeActivityChange,
  formatActivityContactLine,
  formatActivityUptime,
  isActivityNowEmpty,
  resolveActivityStatusDotClass,
  summarizeActivityHours,
  toActivityHourBarModels,
  toActivityNowModel,
} from '../activity-now.helpers';

/** One hour in milliseconds. */
const HOUR_MS = 3_600_000;

/** A local-time hour start, so labels do not depend on the runner's time zone. */
const LOCAL_17H = new Date(2026, 9, 18, 17, 0, 0).getTime();

/** Builds an hour bar with data. */
function bar(count: number, failed = 0, offset = 0): ActivityHourBar {
  return { hourStartMs: LOCAL_17H + offset * HOUR_MS, count, failed, failedShare: count === 0 ? 0 : failed / count, hasData: true };
}

/** Builds an hour with no rollup row. */
function gap(offset = 0): ActivityHourBar {
  return { hourStartMs: LOCAL_17H + offset * HOUR_MS, count: 0, failed: 0, failedShare: 0, hasData: false };
}

/** Builds a write-journal row. */
function change(overrides: Partial<ActivityChange>): ActivityChange {
  return {
    id: 1,
    atMs: 0,
    reportedAtMs: undefined,
    source: 'mobile',
    actionType: 'episode_adjusted',
    animeId: 'a-1',
    animeName: 'Date A Live IV',
    correlationId: '',
    beforeJson: '{"NroCapVisto":10}',
    afterJson: '{"NroCapVisto":11}',
    ...overrides,
  };
}

/** A resolved Now view holding nothing at all. */
const EMPTY_VIEW: ActivityNowView = {
  status: { kind: 'quiet', sentence: 'The phone has been quiet for 9 min', quietMinutes: 9, problems: 0 },
  lastPhoneContactMs: undefined,
  uptimeMs: 60_000,
  requestsToday: 0,
  openIncidents: 0,
  changesToday: 0,
  hours: [gap(0), gap(1)],
  needsALook: [],
  recentChanges: [],
};

describe('resolveActivityStatusDotClass', () => {
  it.each([
    ['in_sync', 'bg-success'],
    ['quiet', 'bg-muted'],
    ['problems', 'bg-warning'],
  ] as const)('colors the %s dot %s', (kind, expected) => {
    expect(resolveActivityStatusDotClass(kind)).toBe(expected);
  });
});

describe('formatActivityUptime', () => {
  it.each([
    [0, '0 min'],
    [59_999, '0 min'],
    [60_000, '1 min'],
    [59 * 60_000, '59 min'],
    [HOUR_MS, '1 h'],
    [3 * HOUR_MS + 26 * 60_000, '3 h 26 min'],
    [24 * HOUR_MS, '1 d'],
    [26 * HOUR_MS + 59 * 60_000, '1 d 2 h'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatActivityUptime(ms)).toBe(expected);
  });
});

describe('formatActivityContactLine', () => {
  it('states the last contact relative to the read and the uptime', () => {
    const view = { ...EMPTY_VIEW, lastPhoneContactMs: 1_000_000, uptimeMs: 3 * HOUR_MS + 26 * 60_000 };

    expect(formatActivityContactLine(view, 1_000_000 + 5 * 60_000)).toBe('Last contact 5m ago · up 3 h 26 min');
  });

  it('says so when no phone contact is stored', () => {
    expect(formatActivityContactLine(EMPTY_VIEW, 0)).toBe('No phone contact recorded · up 1 min');
  });
});

describe('toActivityHourBarModels', () => {
  it('scales each bar to the busiest hour and stacks the failed share on top', () => {
    const [busiest, half] = toActivityHourBarModels([bar(40, 10, 0), bar(20, 0, 1)]);

    expect(busiest).toEqual({ key: LOCAL_17H, label: '17:00', isGap: false, heightPercent: 100, failedPercent: 25, title: '17:00 · 40 requests, 10 failed' });
    expect(half).toMatchObject({ label: '18:00', isGap: false, heightPercent: 50, failedPercent: 0, title: '18:00 · 20 requests' });
  });

  it('keeps a quiet hour with data visible but draws a missing hour as a gap', () => {
    const [busy, quiet, missing] = toActivityHourBarModels([bar(1000, 0, 0), bar(1, 0, 1), gap(2)]);

    expect(busy.heightPercent).toBe(100);
    expect(quiet).toMatchObject({ isGap: false, heightPercent: 4 });
    expect(missing).toMatchObject({ isGap: true, heightPercent: 0, failedPercent: 0, title: '19:00 · no data' });
  });

  it('draws an hour with data and no requests at zero height, not as a gap', () => {
    const [empty] = toActivityHourBarModels([bar(0, 0, 0)]);

    expect(empty).toMatchObject({ isGap: false, heightPercent: 0, title: '17:00 · 0 requests' });
  });

  it('pads a morning hour label to two digits', () => {
    const nine = new Date(2026, 9, 18, 9, 0, 0).getTime();

    expect(toActivityHourBarModels([{ hourStartMs: nine, count: 1, failed: 0, failedShare: 0, hasData: true }])[0].label).toBe('09:00');
  });

  it('labels a single request in the singular', () => {
    expect(toActivityHourBarModels([bar(1, 1, 0)])[0].title).toBe('17:00 · 1 request, 1 failed');
  });
});

describe('summarizeActivityHours', () => {
  it('totals the requests and failures and counts the hours without data', () => {
    expect(summarizeActivityHours([bar(1900, 12, 0), bar(12, 0, 1), gap(2), gap(3)])).toBe(
      'Last 24 hours: 1,912 requests, 12 failed. No data for 2 of 4 hours.',
    );
  });

  it('omits the gap sentence when every hour has data', () => {
    expect(summarizeActivityHours([bar(1, 0, 0)])).toBe('Last 24 hours: 1 request, 0 failed.');
  });
});

describe('describeActivityChange', () => {
  it('words an episode adjustment from the phone', () => {
    expect(describeActivityChange(change({}))).toBe('episode 10 → 11 · from the phone');
  });

  it('words a state change with the stored state labels', () => {
    expect(
      describeActivityChange(change({ source: 'desktop', actionType: 'anime_state_set', beforeJson: '{"Estado":0}', afterJson: '{"Estado":1}' })),
    ).toBe('state Viendo → Finalizado · from the bridge');
  });

  it('words a season grade change, and a first grade without a before', () => {
    expect(describeActivityChange(change({ actionType: 'season_grade_set', beforeJson: '{"grade":4}', afterJson: '{"grade":5}' }))).toBe(
      'grade 4 → 5 · from the phone',
    );
    expect(describeActivityChange(change({ source: 'desktop', actionType: 'season_grade_set', beforeJson: '{}', afterJson: '{"grade":3}' }))).toBe(
      'grade 3 · from the bridge',
    );
    expect(describeActivityChange(change({ actionType: 'season_grade_set', beforeJson: '', afterJson: '{}' }))).toBe('grade changed · from the phone');
  });

  it.each([
    ['anime_soft_deleted', 'removed'],
    ['anime_restored', 'restored'],
    ['anime_repeated', 'watching again'],
    ['cover_refreshed', 'cover refreshed'],
  ])('words %s as %s', (actionType, expected) => {
    expect(describeActivityChange(change({ source: 'system', actionType }))).toBe(`${expected} · by the bridge`);
  });

  it('falls back to the action words when a snapshot cannot be read', () => {
    expect(describeActivityChange(change({ beforeJson: '', afterJson: 'not json' }))).toBe('episode adjusted · from the phone');
    expect(describeActivityChange(change({ beforeJson: '[]', afterJson: '{"NroCapVisto":2}' }))).toBe('episode adjusted · from the phone');
    expect(describeActivityChange(change({ actionType: 'anime_state_set', beforeJson: '{}', afterJson: '{"Estado":1}' }))).toBe('anime state set · from the phone');
    expect(describeActivityChange(change({ beforeJson: '{"NroCapVisto":3}', afterJson: '{}' }))).toBe('episode adjusted · from the phone');
    expect(describeActivityChange(change({ beforeJson: 'null', afterJson: '5' }))).toBe('episode adjusted · from the phone');
  });

  it('reads the episode or state only for the action that changes it', () => {
    expect(describeActivityChange(change({ actionType: 'anime_restored', beforeJson: '{"Estado":0}', afterJson: '{"Estado":1}' }))).toBe('restored · from the phone');
    expect(describeActivityChange(change({ actionType: 'anime_repeated', beforeJson: '{"NroCapVisto":12}', afterJson: '{"NroCapVisto":0}' }))).toBe('watching again · from the phone');
  });

  it('names an unknown writer as stored', () => {
    expect(describeActivityChange(change({ source: 'legacy' }))).toBe('episode 10 → 11 · from legacy');
  });
});

describe('isActivityNowEmpty', () => {
  it('is empty when nothing was ever recorded', () => {
    expect(isActivityNowEmpty(EMPTY_VIEW)).toBe(true);
  });

  it.each([
    ['a phone contact', { lastPhoneContactMs: 5 }],
    ['an hour with data', { hours: [gap(0), bar(0, 0, 1)] }],
    ['a change', { recentChanges: [change({})] }],
    ['an incident', { needsALook: [{ latestId: 1, fingerprint: 'f', reason: 'r', title: 't', latestAtMs: 1, firstSeenAtMs: 1, occurrences: 1, isNew: true, isError: true }] }],
  ])('is not empty with %s', (_name, overrides) => {
    expect(isActivityNowEmpty({ ...EMPTY_VIEW, ...overrides })).toBe(false);
  });
});

describe('toActivityNowModel', () => {
  it('words and formats the resolved view for the components', () => {
    const incident = { latestId: 9, fingerprint: 'f', reason: 'r', title: 'Sync failed', latestAtMs: 1, firstSeenAtMs: 1, occurrences: 5, isNew: true, isError: true };
    const view: ActivityNowView = {
      status: { kind: 'problems', sentence: '1 problem needs a look', quietMinutes: 0, problems: 1 },
      lastPhoneContactMs: 1_000_000,
      uptimeMs: HOUR_MS,
      requestsToday: 1912,
      openIncidents: 1,
      changesToday: 1234,
      hours: [bar(10, 0, 0)],
      needsALook: [incident],
      recentChanges: [change({ id: 4 })],
    };

    expect(toActivityNowModel(view, 1_000_000)).toEqual({
      statusDotClass: 'bg-warning',
      sentence: '1 problem needs a look',
      contactLine: 'Last contact just now · up 1 h',
      figures: [
        { label: 'Requests today', value: '1,912' },
        { label: 'Open incidents', value: '1' },
        { label: 'Changes today', value: '1,234' },
      ],
      bars: toActivityHourBarModels(view.hours),
      chartSummary: 'Last 24 hours: 10 requests, 0 failed.',
      needsALook: [incident],
      changes: [{ key: 4, animeName: 'Date A Live IV', description: 'episode 10 → 11 · from the phone' }],
      isEmpty: false,
    });
  });

  it('marks a view with nothing recorded as empty', () => {
    expect(toActivityNowModel(EMPTY_VIEW, 0).isEmpty).toBe(true);
  });
});
