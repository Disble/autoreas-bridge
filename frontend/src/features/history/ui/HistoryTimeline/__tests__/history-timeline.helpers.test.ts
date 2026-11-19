import { describe, expect, it } from 'vitest';
import type { Anime, WatchHistoryEntry, WatchHistoryPage } from '../../../../../shared/contracts/anime.types';
import type { HistoryAnimeScope } from '../../HistoryFilterBar/history-filter-bar.types';
import type { HistoryFirstPage, HistoryOlderPages, HistoryTimelineGroup } from '../history-timeline.types';
import {
  buildHistoryPageRequest,
  findHistoryTimelineEntry,
  getHistoryStatusColor,
  resolveEventRowKey,
  resolveHistoryAnimeScope,
  resolveHistorySelectedKey,
  toHistoryCatalogLoad,
  toHistoryFirstPageRequest,
  toHistoryTimelineGroups,
  toHistoryTimelinePages,
} from '../history-timeline.helpers';

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
    hasCover: false,
    ...overrides,
  };
}

describe('resolveHistoryAnimeScope', () => {
  it('resolves the anime scope from the filters and the catalog', () => {
    const cases: ReadonlyArray<[string, number | undefined, number | undefined, readonly Anime[], HistoryAnimeScope]> = [
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
    ];

    for (const [caseName, status, type, catalog, expected] of cases) {
      expect.soft(resolveHistoryAnimeScope(catalog, status, type), caseName).toEqual(expected);
    }
  });
});

/** Two loaded day groups: rows 3 and 1 belong to `a`, row 2 to `b`. */
const loadedGroups: readonly HistoryTimelineGroup[] = [
  { dayKey: '2026-09-12', heading: 'September 12, 2026', count: 2, partial: false, entries: [
    { id: 3, animeId: 'a', animeName: 'Frieren', episode: 2, cycle: 1, watchedAtMs: 0, source: 'desktop' },
    { id: 2, animeId: 'b', animeName: 'Bocchi', episode: 1, cycle: 1, watchedAtMs: 0, source: 'desktop' },
  ] },
  { dayKey: '2026-09-11', heading: 'September 11, 2026', count: 1, partial: true, entries: [
    { id: 1, animeId: 'a', animeName: 'Frieren', episode: 1, cycle: 1, watchedAtMs: 0, source: 'desktop' },
  ] },
];

describe('history row selection (design D5)', () => {
  it('selects the row key only when it is loaded and belongs to the anime', () => {
    const cases: ReadonlyArray<[string, string | undefined, number | undefined, number | undefined]> = [
      ['no anime is selected', undefined, 1, undefined],
      ['the row is loaded and belongs to the anime', 'a', 1, 1],
      ['the row belongs to another anime, so the anime\'s first loaded row wins', 'a', 2, 3],
      ['the row is not loaded, so the anime\'s first loaded row wins', 'b', 99, 2],
      ['no row is given, so the anime\'s first loaded row wins', 'a', undefined, 3],
      ['the anime has no loaded row', 'c', undefined, undefined],
    ];

    for (const [caseName, animeId, rowId, expected] of cases) {
      expect.soft(resolveHistorySelectedKey(loadedGroups, animeId, rowId), caseName).toBe(expected);
    }
  });

  it('finds a loaded entry by its ListBox key across days, and nothing for an unknown key', () => {
    expect(findHistoryTimelineEntry(loadedGroups, 1)?.animeId).toBe('a');
    expect(findHistoryTimelineEntry(loadedGroups, 99)).toBeUndefined();
  });
});

describe('open-gesture row resolution (proposal: open the row under the cursor)', () => {
  /** Builds a fake event target whose closest() resolves like an option carrying `data-key`. */
  function targetWithRowKey(raw: string | null): unknown {
    return { closest: (_selector: string) => (raw === null ? null : { getAttribute: (_name: string) => raw }) };
  }

  it('resolves the row under the cursor only from a loaded numeric key', () => {
    const cases: ReadonlyArray<[string, unknown, number | undefined]> = [
      ['a stringified numeric key resolves to the loaded row id', targetWithRowKey('2'), 2],
      ['a target outside any row resolves to nothing', { closest: (_selector: string) => null }, undefined],
      ['a non-element target resolves to nothing', 'not-an-element', undefined],
      ['a null target resolves to nothing', null, undefined],
      ['a data-key with no loaded row resolves to nothing', targetWithRowKey('99'), undefined],
    ];

    for (const [caseName, target, expected] of cases) {
      expect.soft(resolveEventRowKey(target, loadedGroups), caseName).toBe(expected);
    }
  });
});

describe('history row status presentation', () => {
  it('maps every status to its chip color', () => {
    const cases: ReadonlyArray<[number, 'accent' | 'success' | 'warning' | 'danger' | 'default']> = [
      [0, 'accent'], [1, 'success'], [2, 'danger'], [3, 'warning'], [99, 'default'],
    ];

    for (const [status, expectedColor] of cases) {
      const caseName = `maps status ${String(status)} to the ${String(expectedColor)} chip color`;
      expect.soft(getHistoryStatusColor(status), caseName).toBe(expectedColor);
    }
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

describe('buildHistoryPageRequest and toHistoryFirstPageRequest', () => {
  /** The unfiltered, newest-first filters. */
  const unfiltered = { search: 'fri', order: 'oldest' as const };

  it('narrows an ids scope, sends no ids for all, and turns a range into half-open local-day millis', () => {
    expect(buildHistoryPageRequest({ ...unfiltered, range: { from: '2026-09-01', to: '2026-09-02' } }, { kind: 'ids', ids: ['a'] }, 'c:1')).toEqual({
      search: 'fri',
      animeIds: ['a'],
      watchedFromMs: new Date(2026, 8, 1).getTime(),
      watchedToMs: new Date(2026, 8, 3).getTime(),
      order: 'oldest',
      cursor: 'c:1',
      limit: 0,
    });
    expect(buildHistoryPageRequest(unfiltered, { kind: 'all' }, '')).toMatchObject({ animeIds: [], watchedFromMs: 0, watchedToMs: 0 });
  });

  it('reads a first page only for a resolved scope that matches something', () => {
    const cases: ReadonlyArray<[string, HistoryAnimeScope | undefined, boolean]> = [
      ['an unresolved scope', undefined, false],
      ['a scope matching nothing', { kind: 'none' }, false],
      ['the all scope', { kind: 'all' }, true],
    ];

    for (const [caseName, scope, isRead] of cases) {
      expect.soft(toHistoryFirstPageRequest(unfiltered, scope), caseName).toEqual(isRead ? buildHistoryPageRequest(unfiltered, { kind: 'all' }, '') : undefined);
    }
  });
});

describe('toHistoryTimelinePages', () => {
  /** One row of the first page. */
  const first = { id: 1 } as WatchHistoryEntry;
  /** One row of an older page. */
  const second = { id: 2 } as WatchHistoryEntry;
  /** The loaded first page, with a next cursor. */
  const loaded: HistoryFirstPage = {
    status: 'success',
    data: { items: [first], nextCursor: 'c:1', status: 'ok' } as WatchHistoryPage,
    error: null,
    isFetching: false,
    isPlaceholderData: false,
    dataUpdatedAt: 10,
  };
  /** Older pages loaded below that same first page. */
  const older: HistoryOlderPages = { requestKey: 'k', firstPageAt: 10, entries: [first, second], nextCursor: undefined };
  /** The input of a resolved, all-scope timeline. */
  const input = { catalogError: undefined, scope: { kind: 'all' } as const, firstPage: loaded, older: undefined, requestKey: 'k' };

  it('shows no rows and no next page for a failure, an unresolved scope or a pending or stale page', () => {
    const cases = [
      ['a catalog failure', { catalogError: new Error('catalog down') }, { isLoading: false, error: new Error('catalog down') }],
      ['a scope matching nothing', { scope: { kind: 'none' } as const }, { isLoading: false, error: undefined }],
      ['an unresolved scope', { scope: undefined }, { isLoading: true, error: undefined }],
      ['a pending first page', { firstPage: { ...loaded, status: 'pending' as const, data: undefined } }, { isLoading: true, error: undefined }],
      ['a previous request page', { firstPage: { ...loaded, isPlaceholderData: true } }, { isLoading: true, error: undefined }],
      ['a failed first page', { firstPage: { ...loaded, status: 'error' as const, error: new Error('boom') } }, { isLoading: false, error: new Error('boom') }],
    ] as const;

    for (const [caseName, overrides, expected] of cases) {
      expect.soft(toHistoryTimelinePages({ ...input, ...overrides }), caseName).toEqual({ entries: [], cursor: undefined, ...expected });
    }
  });

  it('shows the first page and its cursor when no older page continues it', () => {
    expect(toHistoryTimelinePages(input)).toEqual({ entries: [first], isLoading: false, error: undefined, cursor: 'c:1' });
  });

  it('shows the older pages and their cursor when they continue this request and first-page load', () => {
    expect(toHistoryTimelinePages({ ...input, older })).toEqual({ entries: [first, second], isLoading: false, error: undefined, cursor: undefined });
  });

  it('drops older pages loaded for another request or an earlier first page', () => {
    const cases = [
      ['another request', { ...older, requestKey: 'other' }],
      ['an earlier first-page load', { ...older, firstPageAt: 9 }],
    ] as const;

    for (const [caseName, stale] of cases) {
      expect.soft(toHistoryTimelinePages({ ...input, older: stale }), caseName).toMatchObject({ entries: [first], cursor: 'c:1' });
    }
  });
});

describe('toHistoryCatalogLoad', () => {
  /** A loaded catalog. */
  const catalog = [anime()];

  it('reads each catalog query state as its load', () => {
    const cases = [
      ['a loaded catalog', { status: 'success' as const, data: catalog }, { catalog, error: undefined }],
      ['a loaded empty catalog', { status: 'success' as const, data: [] }, { catalog: [], error: undefined }],
      ['a pending read', { status: 'pending' as const, data: undefined }, { catalog: undefined, error: undefined }],
      ['a failed read', { status: 'error' as const, data: undefined, error: new Error('anime: db closed') }, { catalog: undefined, error: new Error('anime: db closed') }],
    ] as const;

    for (const [caseName, query, expected] of cases) {
      expect.soft(toHistoryCatalogLoad({ error: null, isFetching: false, ...query }), caseName).toEqual(expected);
    }
  });
});
