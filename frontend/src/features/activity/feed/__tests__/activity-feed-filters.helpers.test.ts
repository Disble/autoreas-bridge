import { describe, expect, it } from 'vitest';
import {
  createInitialFilters,
  fromCalendarRange,
  scaleWindowStart,
  setFilterRange,
  toCalendarBounds,
  toCalendarRange,
  toFeedQuery,
  toggleFailureTypes,
  toggleFeedTypes,
  typeSelectionKeys,
} from '../activity-feed-filters.helpers';
import { ACTIVITY_DEFAULT_TYPES, ACTIVITY_FAILURE_TYPES, ACTIVITY_TOGGLE_TYPES } from '../activity-feed.constants';
import { NOW_MS, dayStart } from './activity-feed.fixtures';

/** The filters every case starts from. */
const INITIAL = createInitialFilters(NOW_MS);

describe('createInitialFilters', () => {
  it('opens on 24 h, every origin, Traffic off and the failure filter off with every failure type', () => {
    expect(INITIAL).toEqual({
      scale: '24h',
      range: undefined,
      origin: 'all',
      types: ACTIVITY_DEFAULT_TYPES,
      failuresOnly: false,
      failureTypes: ACTIVITY_FAILURE_TYPES,
      anchorMs: NOW_MS,
    });
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

  it('reads the picked range and, with the failure filter on, the failure types', () => {
    const filters = { ...INITIAL, range: { fromMs: 10, toMs: 20 }, failuresOnly: true, failureTypes: ['bridge'] as const };

    expect(toFeedQuery(filters, '', 40)).toMatchObject({ fromMs: 10, toMs: 20, types: ['bridge'], failuresOnly: true });
  });

  it.each([
    ['no type is selected', { types: [] }],
    ['the failure filter has no type', { failuresOnly: true, failureTypes: [] }],
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

  it('turns one type off while every type is on', () => {
    const allOn = { ...INITIAL, types: ACTIVITY_TOGGLE_TYPES };

    expect(toggleFeedTypes(allOn, new Set(['all', 'change', 'traffic', 'download', 'task']), NOW_MS).types).toEqual(['change', 'traffic', 'download', 'task']);
  });

  it('turns the failure filter off and moves the window anchor (design, Failure button: any type filter exits)', () => {
    const next = toggleFeedTypes({ ...INITIAL, failuresOnly: true }, new Set(['change']), NOW_MS + 5);

    expect(next.failuresOnly).toBe(false);
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

describe('toggleFailureTypes', () => {
  it('keeps only known failure types, in menu order', () => {
    expect(toggleFailureTypes(INITIAL, new Set(['bridge', 'change', 'nope'])).failureTypes).toEqual(['change', 'bridge']);
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
  it('turns a picked range into its local days and back into whole local days', () => {
    const range = { fromMs: new Date(2026, 9, 20, 9, 30).getTime(), toMs: new Date(2026, 9, 21, 15, 0).getTime() };
    const value = toCalendarRange(range);

    expect(value?.start.toString()).toBe('2026-10-20');
    expect(value?.end.toString()).toBe('2026-10-21');
    expect(fromCalendarRange(value)).toEqual({ fromMs: dayStart(2), toMs: dayStart(0) - 1 });
  });

  it('maps no range to no calendar value and back', () => {
    expect(toCalendarRange(undefined)).toBeNull();
    expect(fromCalendarRange(null)).toBeUndefined();
  });
});

describe('toCalendarBounds', () => {
  it('offers the 90 days of the ledger span up to today', () => {
    const bounds = toCalendarBounds(NOW_MS);

    expect([bounds.minValue.toString(), bounds.maxValue.toString()]).toEqual(['2026-07-25', '2026-10-22']);
  });
});
