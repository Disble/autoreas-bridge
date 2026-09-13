import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import type { HistoryAnimeScope } from '../../HistoryFilterBar/history-filter-bar.types';
import { resolveHistoryAnimeScope } from '../history-timeline.helpers';

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
