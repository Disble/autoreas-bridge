import { describe, expect, it } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import type { HistoryAnimeScope } from '../../HistoryFilterBar/history-filter-bar.types';
import type { HistoryTimelineGroup } from '../history-timeline.types';
import {
  findHistoryTimelineEntry,
  getHistoryStatusColor,
  resolveEventRowKey,
  resolveHistoryAnimeScope,
  resolveHistorySelectedKey,
  toHistoryTimelineGroups,
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
  it.each<[string, string | undefined, number | undefined, number | undefined]>([
    ['no anime is selected', undefined, 1, undefined],
    ['the row is loaded and belongs to the anime', 'a', 1, 1],
    ['the row belongs to another anime, so the anime\'s first loaded row wins', 'a', 2, 3],
    ['the row is not loaded, so the anime\'s first loaded row wins', 'b', 99, 2],
    ['no row is given, so the anime\'s first loaded row wins', 'a', undefined, 3],
    ['the anime has no loaded row', 'c', undefined, undefined],
  ])('selects the right key when %s', (_label, animeId, rowId, expected) => {
    expect(resolveHistorySelectedKey(loadedGroups, animeId, rowId)).toBe(expected);
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

  it.each<[string, unknown, number | undefined]>([
    ['a stringified numeric key resolves to the loaded row id', targetWithRowKey('2'), 2],
    ['a target outside any row resolves to nothing', { closest: (_selector: string) => null }, undefined],
    ['a non-element target resolves to nothing', 'not-an-element', undefined],
    ['a null target resolves to nothing', null, undefined],
    ['a data-key with no loaded row resolves to nothing', targetWithRowKey('99'), undefined],
  ])('%s', (_label, target, expected) => {
    expect(resolveEventRowKey(target, loadedGroups)).toBe(expected);
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
