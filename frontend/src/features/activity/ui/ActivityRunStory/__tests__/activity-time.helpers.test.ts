import { describe, expect, it } from 'vitest';
import type { AsyncView } from '../../../../../shared/query/async-view/async-view.types';
import type { ActivityRead } from '../activity-run-story.types';
import {
  formatActivityClock,
  formatActivityDuration,
  formatActivityOffset,
  isActivityReadGone,
  toActivityFoundRead,
  toActivityQueryRead,
  toActivityReadValue,
} from '../activity-time.helpers';

describe('activity-time.helpers', () => {
  it('formats a local clock with milliseconds, zero-padded', () => {
    expect(formatActivityClock(new Date(2026, 9, 17, 7, 1, 4, 5).getTime())).toBe('07:01:04.005');
    expect(formatActivityClock(new Date(2026, 9, 17, 17, 31, 44, 120).getTime())).toBe('17:31:44.120');
  });

  it('formats a duration in its largest fitting units', () => {
    const cases = [
      [0, '0 ms'],
      [41, '41 ms'],
      [999, '999 ms'],
      [1_000, '1.0 s'],
      [3_240, '3.2 s'],
      [59_999, '60.0 s'],
      [60_000, '1 min'],
      [125_000, '2 min 5 s'],
    ] as const;

    for (const [ms, expected] of cases) {
      const caseName = `formats a ${String(ms)} ms duration as ${String(expected)}`;
      expect.soft(formatActivityDuration(ms), caseName).toBe(expected);
    }
  });

  it('formats an offset from the incident in minutes and seconds with its sign', () => {
    const cases = [
      [-120_000, '−2 min'],
      [-90_000, '−1 min 30 s'],
      [-30_000, '−30 s'],
      [0, '0 s'],
      [30_000, '+30 s'],
      [400, '+0 s'],
      [60_000, '+1 min'],
      [180_000, '+3 min'],
    ] as const;

    for (const [ms, expected] of cases) {
      const caseName = `formats a ${String(ms)} ms offset from the incident as ${String(expected)}`;
      expect.soft(formatActivityOffset(ms), caseName).toBe(expected);
    }
  });

});

describe('activity read helpers', () => {
  it('shows each query state as its read', () => {
    const cases: ReadonlyArray<[string, AsyncView<ActivityRead<string>>, boolean, ActivityRead<string>]> = [
      ['pending', { kind: 'loading' }, true, { status: 'loading' }],
      ['answered and reading again', { kind: 'ready', data: { status: 'ready', value: 'v' }, isRefreshing: true }, true, { status: 'loading' }],
      ['failed and reading again', { kind: 'failure', code: 'internal', message: 'boom' }, true, { status: 'loading' }],
      ['failed', { kind: 'failure', code: 'failed_precondition', message: 'observability: db closed' }, false, { status: 'failed' }],
      ['found nothing', { kind: 'empty' }, false, { status: 'gone' }],
      ['answered', { kind: 'ready', data: { status: 'ready', value: 'v' }, isRefreshing: false }, false, { status: 'ready', value: 'v' }],
    ];

    for (const [caseName, view, isFetching, expected] of cases) {
      expect.soft(toActivityQueryRead(view, isFetching), caseName).toEqual(expected);
    }
  });

  it('counts only a lookup that found nothing as gone', () => {
    expect(isActivityReadGone({ status: 'gone' })).toBe(true);
    expect(isActivityReadGone({ status: 'ready', value: 1 })).toBe(false);
  });

  it('reads a missing value as gone and a found one as ready', () => {
    expect(toActivityFoundRead(undefined)).toEqual({ status: 'gone' });
    expect(toActivityFoundRead(7)).toEqual({ status: 'ready', value: 7 });
  });

  it('takes the value of a ready read only', () => {
    expect(toActivityReadValue({ status: 'ready', value: 'v' })).toBe('v');
    expect(toActivityReadValue({ status: 'gone' })).toBeUndefined();
    expect(toActivityReadValue(undefined)).toBeUndefined();
  });

});
