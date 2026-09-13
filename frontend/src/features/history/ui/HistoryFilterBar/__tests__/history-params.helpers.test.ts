import { describe, expect, it } from 'vitest';
import { parseHistoryParams, serializeHistoryParams } from '../history-params.helpers';
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
    ['only one bound present is absent', 'from=2026-09-01', {}],
    ['an anime id and its row id', 'anime=anime-1&row=42', { animeId: 'anime-1', rowId: 42 }],
    ['a non-integer row id is absent, not an error', 'anime=anime-1&row=abc', { animeId: 'anime-1' }],
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
