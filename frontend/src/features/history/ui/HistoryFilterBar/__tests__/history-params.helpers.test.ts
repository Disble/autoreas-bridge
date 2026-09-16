import { describe, expect, it } from 'vitest';
import { formatHistoryRangeLabel, hasActiveHistoryFilters, parseHistoryParams, serializeHistoryParams, toLocalDayRangeMs } from '../history-params.helpers';
import type { HistoryParams } from '../history-filter-bar.types';

describe('parseHistoryParams', () => {
  it.each<[string, string, Partial<HistoryParams>]>([
    ['no params at all', '', {}],
    ['a search query', 'q=frieren', { search: 'frieren' }],
    ['a known status', 'status=2', { status: 2 }],
    ['an out-of-domain status is absent, not an error', 'status=9', {}],
    ['a non-numeric status is absent, not an error', 'status=abc', {}],
    ['a known type', 'type=3', { type: 3 }],
    ['sort=oldest', 'sort=oldest', { order: 'oldest' }],
    ['an unrecognized sort value defaults to newest', 'sort=sideways', {}],
    ['a valid watched range', 'from=2026-09-01&to=2026-09-13', { range: { from: '2026-09-01', to: '2026-09-13' } }],
    ['from after to is absent, not an error', 'from=2026-09-13&to=2026-09-01', {}],
    ['a malformed date is absent, not an error', 'from=not-a-date&to=2026-09-13', {}],
    ['a malformed to bound is absent, not an error', 'from=2026-09-01&to=not-a-date', {}],
    ['a single-day range is a real range', 'from=2026-09-13&to=2026-09-13', { range: { from: '2026-09-13', to: '2026-09-13' } }],
    ['only one bound present is absent', 'from=2026-09-01', {}],
    ['an anime id and its row id', 'anime=anime-1&row=42', { animeId: 'anime-1', rowId: 42 }],
    ['a non-integer row id is absent, not an error', 'anime=anime-1&row=abc', { animeId: 'anime-1' }],
    ['a negative row id is absent', 'anime=anime-1&row=-1', { animeId: 'anime-1' }],
    ['row id zero is a real row', 'anime=anime-1&row=0', { animeId: 'anime-1', rowId: 0 }],
    ['an empty anime id is absent', 'anime=&row=4', { rowId: 4 }],
  ])('parses %s', (_label, query, overrides) => {
    const expected: HistoryParams = { search: '', order: 'newest', ...overrides };

    expect(parseHistoryParams(new URLSearchParams(query))).toEqual(expected);
  });
});

describe('serializeHistoryParams', () => {
  it('omits every field at its default value', () => {
    const params: HistoryParams = { search: '', order: 'newest' };

    expect(serializeHistoryParams(params).toString()).toBe('');
  });

  it('writes sort only when set to oldest', () => {
    expect(serializeHistoryParams({ search: '', order: 'oldest' }).toString()).toBe('sort=oldest');
  });

  it('round-trips a fully populated state', () => {
    const full: HistoryParams = {
      search: 'frieren',
      status: 1,
      type: 0,
      range: { from: '2026-09-01', to: '2026-09-13' },
      order: 'oldest',
      animeId: 'anime-1',
      rowId: 42,
    };

    expect(parseHistoryParams(serializeHistoryParams(full))).toEqual(full);
  });
});

describe('hasActiveHistoryFilters', () => {
  it.each<[string, Partial<HistoryParams>, boolean]>([
    ['only the sort and selection are set', { order: 'oldest', animeId: 'anime-1', rowId: 1 }, false],
    ['a search is set', { search: 'fri' }, true],
    ['a status is set', { status: 0 }, true],
    ['a type is set', { type: 0 }, true],
    ['a watched range is set', { range: { from: '2026-09-01', to: '2026-09-02' } }, true],
  ])('when %s: %s', (_label, params, expected) => {
    expect(hasActiveHistoryFilters({ search: '', order: 'newest', ...params })).toBe(expected);
  });
});

describe('toLocalDayRangeMs', () => {
  it('converts a local-day range to half-open epoch millis (design D4)', () => {
    expect(toLocalDayRangeMs('2026-09-01', '2026-09-13')).toEqual([
      new Date(2026, 8, 1).getTime(),
      new Date(2026, 8, 14).getTime(),
    ]);
  });

  it('is exclusive on the end bound even for a single-day range', () => {
    expect(toLocalDayRangeMs('2026-09-01', '2026-09-01')).toEqual([
      new Date(2026, 8, 1).getTime(),
      new Date(2026, 8, 2).getTime(),
    ]);
  });

  it('rolls the exclusive end over a month boundary', () => {
    expect(toLocalDayRangeMs('2026-09-28', '2026-09-30')).toEqual([
      new Date(2026, 8, 28).getTime(),
      new Date(2026, 9, 1).getTime(),
    ]);
  });
});

describe('formatHistoryRangeLabel', () => {
  it.each([
    ['names a shared year once', { from: '2026-09-01', to: '2026-09-13' }, 'Sep 1 – Sep 13, 2026'],
    ['names both years across a year boundary', { from: '2025-12-30', to: '2026-01-02' }, 'Dec 30, 2025 – Jan 2, 2026'],
    ['keeps a single-day range on its own day', { from: '2026-09-13', to: '2026-09-13' }, 'Sep 13 – Sep 13, 2026'],
  ])('%s', (_case, range, expected) => {
    expect(formatHistoryRangeLabel(range)).toBe(expected);
  });
});
