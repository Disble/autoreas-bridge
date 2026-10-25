import { Time } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
  createInitialFilters,
  fromCalendarPick,
  scaleWindowStart,
  setFilterRange,
  toCalendarBounds,
  toCalendarRange,
  toFeedQuery,
  toRangeTimes,
  toggleFailuresOnly,
  toggleFeedTypes,
  typeSelectionKeys,
} from '../activity-feed-filters.helpers';
import { ACTIVITY_DEFAULT_TYPES, ACTIVITY_TOGGLE_TYPES } from '../activity-feed.constants';
import { NOW_MS, dayStart } from './activity-feed.fixtures';

/** The filters every case starts from. */
const INITIAL = createInitialFilters(NOW_MS);

describe('createInitialFilters', () => {
  it('opens on 24 h, every origin, Traffic and System off and the failure filter off', () => {
    expect(INITIAL).toEqual({
      scale: '24h',
      range: undefined,
      origin: 'all',
      types: ['change', 'download', 'task', 'edit'],
      failuresOnly: false,
      anchorMs: NOW_MS,
    });
    expect(INITIAL.types).not.toContain('traffic');
  });
});

describe('scaleWindowStart', () => {
  it.each([
    ['24h', new Date(2026, 9, 21, 13, 0).getTime()],
    ['7d', dayStart(6)],
    ['30d', dayStart(29)],
    ['90d', dayStart(89)],
  ] as const)('starts the %s window where the chart starts', (scale, expected) => {
    expect(scaleWindowStart(scale, NOW_MS)).toBe(expected);
  });
});

describe('toFeedQuery', () => {
  it('reads the scale window up to now with the selected types when no range is picked', () => {
    expect(toFeedQuery(INITIAL, 'c1', 40)).toEqual({
      fromMs: scaleWindowStart('24h', NOW_MS),
      toMs: 0,
      origin: 'all',
      types: ACTIVITY_DEFAULT_TYPES,
      failuresOnly: false,
      cursor: 'c1',
      limit: 40,
    });
  });

  it('reads the picked range and, with the failure filter on, the failures of the selected sections', () => {
    const filters = { ...INITIAL, range: { fromMs: 10, toMs: 20 }, types: ['download', 'system'] as const, failuresOnly: true };

    // the switch narrows what the sections leave; it never picks types of its own (owner, 2026-10-24)
    expect(toFeedQuery(filters, '', 40)).toMatchObject({ fromMs: 10, toMs: 20, types: ['download', 'system'], failuresOnly: true });
  });

  it.each([
    ['no type is selected', { types: [] }],
    ['no type is selected with the failure filter on', { types: [], failuresOnly: true }],
  ])('reads nothing when %s, since Go reads every type for an empty set', (_case, patch) => {
    expect(toFeedQuery({ ...INITIAL, ...patch }, '', 40)).toBeUndefined();
  });
});

describe('toggleFeedTypes', () => {
  it.each([
    ['All turns every type on', new Set(['all', 'change']), ACTIVITY_TOGGLE_TYPES],
    ['a toggle keeps only the picked types, in toolbar order', new Set(['edit', 'change']), ['change', 'edit']],
    ['no toggle leaves no type', new Set<string>(), []],
  ])('%s', (_case, keys, expected) => {
    expect(toggleFeedTypes(INITIAL, keys, NOW_MS).types).toEqual(expected);
  });

  it('keeps every type on when All is pressed while every type is on', () => {
    const allOn = { ...INITIAL, types: ACTIVITY_TOGGLE_TYPES };

    expect(toggleFeedTypes(allOn, new Set(ACTIVITY_TOGGLE_TYPES), NOW_MS).types).toEqual(ACTIVITY_TOGGLE_TYPES);
  });

  it('turns System off like any other type while every type is on', () => {
    const allOn = { ...INITIAL, types: ACTIVITY_TOGGLE_TYPES };
    const next = toggleFeedTypes(allOn, new Set(['all', 'change', 'traffic', 'download', 'task', 'edit']), NOW_MS);

    expect(next.types).toEqual(['change', 'traffic', 'download', 'task', 'edit']);
    expect(toFeedQuery(next, '', 40)?.types).not.toContain('system');
  });

  it('keeps the failure filter on and moves the window anchor (design, Failure button: a section toggle keeps it)', () => {
    const next = toggleFeedTypes({ ...INITIAL, failuresOnly: true }, new Set(['change']), NOW_MS + 5);

    expect(next.failuresOnly).toBe(true);
    expect(next.anchorMs).toBe(NOW_MS + 5);
  });
});

describe('typeSelectionKeys', () => {
  it.each([
    [ACTIVITY_TOGGLE_TYPES, ['all', ...ACTIVITY_TOGGLE_TYPES]],
    [['change'], ['change']],
  ] as const)('selects All only when every type is on (%j)', (types, expected) => {
    expect([...typeSelectionKeys(types)]).toEqual(expected);
  });
});

describe('toggleFailuresOnly', () => {
  it('turns the failure filter on, then off again, keeping the sections', () => {
    const on = toggleFailuresOnly(INITIAL);

    expect(on).toEqual({ ...INITIAL, failuresOnly: true });
    expect(toggleFailuresOnly(on)).toEqual(INITIAL);
  });
});

describe('setFilterRange', () => {
  it.each([
    ['keeps the scale for a range inside its window', { fromMs: NOW_MS - 3_600_000, toMs: NOW_MS }, '24h'],
    ['opens the smallest daily scale that holds an older range', { fromMs: dayStart(10), toMs: dayStart(9) }, '30d'],
    ['falls back to 90 days for a range older than every window', { fromMs: dayStart(200), toMs: dayStart(199) }, '90d'],
  ] as const)('%s', (_case, range, scale) => {
    const next = setFilterRange(INITIAL, range, NOW_MS);

    expect(next.range).toEqual(range);
    expect(next.scale).toBe(scale);
  });

  it('clears the range and keeps the scale', () => {
    const picked = setFilterRange(INITIAL, { fromMs: dayStart(10), toMs: dayStart(9) }, NOW_MS);

    expect(setFilterRange(picked, undefined, NOW_MS)).toMatchObject({ range: undefined, scale: '30d' });
  });
});

describe('calendar range', () => {
  /** The picker's opening times (mockup: 00:00 and 23:59). */
  const WHOLE_DAYS = { start: new Time(0, 0), end: new Time(23, 59) };

  it('turns a picked range into its local days and its start and end times', () => {
    const range = { fromMs: new Date(2026, 9, 20, 9, 30).getTime(), toMs: new Date(2026, 9, 21, 15, 5).getTime() };
    const value = toCalendarRange(range);
    const times = toRangeTimes(range);

    expect(value?.start.toString()).toBe('2026-10-20');
    expect(value?.end.toString()).toBe('2026-10-21');
    expect(times.start.toString()).toBe('09:30:00');
    expect(times.end.toString()).toBe('15:05:00');
  });

  it('maps no range to no calendar value and to the whole-day times', () => {
    expect(toCalendarRange(undefined)).toBeNull();
    expect(toRangeTimes(undefined)).toEqual(WHOLE_DAYS);
    expect(fromCalendarPick(null, WHOLE_DAYS, NOW_MS)).toBeUndefined();
  });

  it('combines the picked days with the times, the end minute inclusive', () => {
    const days = toCalendarRange({ fromMs: dayStart(4), toMs: dayStart(3) });
    const times = { start: new Time(9, 30), end: new Time(18, 15) };

    expect(fromCalendarPick(days, WHOLE_DAYS, NOW_MS)).toEqual({ fromMs: dayStart(4), toMs: dayStart(2) - 1 });
    expect(fromCalendarPick(days, times, NOW_MS)).toEqual({
      fromMs: new Date(2026, 9, 18, 9, 30).getTime(),
      toMs: new Date(2026, 9, 19, 18, 15, 59, 999).getTime(),
    });
  });

  it('swaps a one-day pick whose end time is before its start time', () => {
    const day = toCalendarRange({ fromMs: dayStart(1), toMs: dayStart(1) });

    expect(fromCalendarPick(day, { start: new Time(18, 0), end: new Time(9, 0) }, NOW_MS)).toEqual({
      fromMs: new Date(2026, 9, 21, 9, 0, 59, 999).getTime(),
      toMs: new Date(2026, 9, 21, 18, 0).getTime(),
    });
  });

  it('ends a pick that reaches today at now', () => {
    const today = toCalendarRange({ fromMs: NOW_MS, toMs: NOW_MS });

    expect(fromCalendarPick(today, WHOLE_DAYS, NOW_MS)).toEqual({ fromMs: dayStart(0), toMs: NOW_MS });
  });
});

describe('toCalendarBounds', () => {
  it('offers the 90 days of the ledger span up to today', () => {
    const bounds = toCalendarBounds(NOW_MS);

    expect([bounds.minValue.toString(), bounds.maxValue.toString()]).toEqual(['2026-07-25', '2026-10-22']);
  });
});
