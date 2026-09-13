import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import type { HistoryAnimeScope } from '../../HistoryFilterBar/history-filter-bar.types';
import { getHistoryStatusColor, resolveHistoryAnimeScope, toHistoryTimelineGroups } from '../history-timeline.helpers';

/** Builds a minimal catalog `Anime` fixture, overriding only what a case needs. */
function anime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: 'anime-1',
    name: 'Frieren',
    status: 0,
    episodesWatched: 1,
    active: 1,
    days: [],
    genres: [],
    hasDownloadPage: false,
    hasFolder: false,
    ...overrides,
  };
}

describe('resolveHistoryAnimeScope', () => {
  it.each<[string, number | undefined, number | undefined, readonly Anime[], HistoryAnimeScope]>([
    ['neither filter is set', undefined, undefined, [anime({ id: 'a', status: 0 })], { kind: 'all' }],
    [
      'a Status filter matches one anime out of two',
      0,
      undefined,
      [anime({ id: 'a', status: 0 }), anime({ id: 'b', status: 1 })],
      { kind: 'ids', ids: ['a'] },
    ],
    [
      'a Type filter matches one anime out of two',
      undefined,
      1,
      [anime({ id: 'a', kind: 1 }), anime({ id: 'b', kind: 0 })],
      { kind: 'ids', ids: ['a'] },
    ],
    [
      'Status and Type combined narrow to the one anime matching both',
      0,
      1,
      [anime({ id: 'a', status: 0, kind: 1 }), anime({ id: 'b', status: 0, kind: 0 })],
      { kind: 'ids', ids: ['a'] },
    ],
    ['a Status filter matches nothing in the catalog', 3, undefined, [anime({ id: 'a', status: 0 })], { kind: 'none' }],
  ])('%s', (_label, status, type, catalog, expected) => {
    expect(resolveHistoryAnimeScope(catalog, status, type)).toEqual(expected);
  });
});

describe('history row status presentation', () => {
  it.each<[number, 'accent' | 'success' | 'warning' | 'danger' | 'default']>([
    [0, 'accent'], [1, 'success'], [2, 'danger'], [3, 'warning'], [99, 'default'],
  ])('maps status %i to the %s chip color', (status, expectedColor) => {
    expect(getHistoryStatusColor(status)).toBe(expectedColor);
  });

  it('joins catalog status data to history rows and leaves deleted animes chipless', () => {
    const groups = toHistoryTimelineGroups([{ dayKey: '2026-09-12', heading: 'September 12, 2026', count: 2, partial: true, entries: [
      { id: 1, animeId: 'present', animeName: 'Frieren', episode: 1, cycle: 1, watchedAtMs: 0, source: 'desktop' },
      { id: 2, animeId: 'deleted', animeName: 'Deleted anime', episode: 1, cycle: 1, watchedAtMs: 0, source: 'desktop' },
    ] }], [anime({ id: 'present', status: 1 })]);

    expect(groups[0]?.entries).toEqual([
      expect.objectContaining({ statusLabel: 'Finalizado', statusColor: 'success' }),
      expect.not.objectContaining({ statusLabel: expect.anything(), statusColor: expect.anything() }),
    ]);
  });
});
