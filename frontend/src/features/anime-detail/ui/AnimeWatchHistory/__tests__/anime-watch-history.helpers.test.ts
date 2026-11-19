import { describe, expect, it } from 'vitest';

import type { AnimeDetail, AnimeRepeticion, WatchHistoryEntry, WatchHistoryPage } from '../../../../../shared/contracts/anime.types';
import {
  buildAnimeWatchEpisodesRequest,
  formatAnimeWatchHistorySubtitle,
  formatAnimeWatchSummaryDate,
  toAnimeWatchEpisodePages,
  toAnimeWatchViewModels,
} from '../anime-watch-history.helpers';
import type { AnimeWatchFirstPage, AnimeWatchOlderPages } from '../anime-watch-history.types';

/** Local-midnight start of the watch-history log; written out so the suite never pins the production constant itself. */
const LOG_START_MS = new Date(2026, 6, 5).getTime();

/** Builds a repetition entry with the fields the watch view model reads, defaulting to a finished first watch. */
function repetition(overrides: Partial<AnimeRepeticion> = {}): AnimeRepeticion {
  return {
    numRepetitions: 0,
    episodesWatched: 5,
    status: 1,
    createdAt: new Date(2021, 7, 16).getTime(),
    ...overrides,
  };
}

/** Builds the smallest `AnimeDetail` the watch view model accepts. */
function detail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    id: 'frieren',
    name: 'Frieren',
    status: 0,
    episodesWatched: 5,
    totalEpisodes: 12,
    active: 1,
    kind: 0,
    genres: [],
    firstCycle: 1,
    days: [],
    repetitions: [],
    modified_at: 1,
    ...overrides,
  };
}

describe('toAnimeWatchViewModels', () => {
  it('sorts a shuffled wire order by numRepetitions and numbers the current watch R + 1', () => {
    const watches = toAnimeWatchViewModels(
      detail({
        episodesWatched: 11,
        repetitions: [
          repetition({ numRepetitions: 2, episodesWatched: 9 }),
          repetition({ numRepetitions: 0, episodesWatched: 5 }),
          repetition({ numRepetitions: 1, episodesWatched: 7 }),
        ],
      }),
      LOG_START_MS,
    );

    expect(watches.map((watch) => watch.number)).toEqual([1, 2, 3, 4]);
    expect(watches.map((watch) => watch.isCurrent)).toEqual([false, false, false, true]);
    expect(watches.map((watch) => watch.key)).toEqual(['watch-1', 'watch-2', 'watch-3', 'watch-4']);
    // Identity per position: each past watch keeps its own stored episode
    // count, so a wrong order (or no order at all) cannot hide behind the
    // positional numbers above.
    expect(watches.map((watch) => watch.episodesLabel)).toEqual([
      '5 episodes',
      '7 episodes',
      '9 episodes',
      '11 of 12 episodes',
    ]);
  });

  it('renders a single live watch when the wire omits the repetitions field', () => {
    const watches = toAnimeWatchViewModels(detail({ repetitions: undefined }), LOG_START_MS);

    expect(watches).toHaveLength(1);
    expect(watches[0].isCurrent).toBe(true);
    expect(watches[0].number).toBe(1);
  });

  it.each([
    {
      name: 'prefers deletedAt',
      end: {
        deletedAt: new Date(2021, 8, 8).getTime(),
        lastWatchedAt: new Date(2021, 8, 1).getTime(),
        repeatedAt: new Date(2026, 7, 29).getTime(),
      },
      wantSpan: 'Aug 16 – Sep 8, 2021',
    },
    {
      name: 'falls back to lastWatchedAt',
      end: {
        lastWatchedAt: new Date(2021, 8, 1).getTime(),
        repeatedAt: new Date(2026, 7, 29).getTime(),
      },
      wantSpan: 'Aug 16 – Sep 1, 2021',
    },
    {
      name: 'falls back to repeatedAt',
      end: { repeatedAt: new Date(2026, 7, 29).getTime() },
      wantSpan: 'Aug 16, 2021 – Aug 29, 2026',
    },
  ])('ends a past watch span at the $name date ($wantSpan)', ({ end, wantSpan }) => {
    const watches = toAnimeWatchViewModels(
      detail({ repetitions: [repetition({ ...end })] }),
      LOG_START_MS,
    );

    expect(watches[0].spanLabel).toBe(wantSpan);
  });

  it('starts the current watch at the last repeat and ends it at lastWatchedAt', () => {
    const watches = toAnimeWatchViewModels(
      detail({
        repetitions: [repetition({ repeatedAt: new Date(2026, 7, 29).getTime() })],
        lastWatchedAt: new Date(2026, 7, 15).getTime(),
      }),
      LOG_START_MS,
    );

    expect(watches[1].spanLabel).toBe('Aug 29 – Aug 15, 2026');
  });

  it('starts the current watch at createdAt when nothing was ever repeated', () => {
    const watches = toAnimeWatchViewModels(
      detail({ createdAt: new Date(2026, 7, 1).getTime(), lastWatchedAt: new Date(2026, 7, 15).getTime() }),
      LOG_START_MS,
    );

    expect(watches).toHaveLength(1);
    expect(watches[0].spanLabel).toBe('Aug 1 – Aug 15, 2026');
  });

  it.each([
    { name: 'end', dates: { createdAt: new Date(2026, 7, 1).getTime() }, want: 'Aug 1, 2026 – Unknown' },
    { name: 'start', dates: { lastWatchedAt: new Date(2026, 7, 15).getTime() }, want: 'Unknown – Aug 15, 2026' },
  ])('names an undated span $name Unknown beside the dated half', ({ dates, want }) => {
    const watches = toAnimeWatchViewModels(detail(dates), LOG_START_MS);

    expect(watches[0].spanLabel).toBe(want);
  });

  it.each([
    {
      name: 'counts against the total when known',
      watched: 5,
      total: 12 as number | undefined,
      wantPastLabel: '5 episodes',
      wantCurrentLabel: '5 of 12 episodes',
      wantRatio: 42 as number | undefined,
    },
    {
      name: 'counts standalone without a total',
      watched: 5,
      total: undefined,
      wantPastLabel: '5 episodes',
      wantCurrentLabel: '5 episodes',
      wantRatio: undefined,
    },
    {
      name: 'reads a single episode in the singular',
      watched: 1,
      total: undefined,
      wantPastLabel: '1 episode',
      wantCurrentLabel: '1 episode',
      wantRatio: undefined,
    },
  ])('$name', ({ watched, total, wantPastLabel, wantCurrentLabel, wantRatio }) => {
    const watches = toAnimeWatchViewModels(
      detail({
        episodesWatched: watched,
        totalEpisodes: total,
        repetitions: [repetition({ episodesWatched: watched })],
      }),
      LOG_START_MS,
    );

    expect(watches[0].episodesLabel).toBe(wantPastLabel);
    expect(watches[0].progressRatio).toBe(wantRatio);
    expect(watches[1].episodesLabel).toBe(wantCurrentLabel);
    expect(watches[1].progressRatio).toBe(wantRatio);
  });

  it.each([
    { name: 'a watch ending one millisecond before the log start', end: LOG_START_MS - 1, wantPreLog: true },
    { name: 'a watch ending exactly at the log start', end: LOG_START_MS, wantPreLog: false },
    { name: 'a watch ending after the log start', end: LOG_START_MS + 1, wantPreLog: false },
    { name: 'a watch with no recorded end', end: undefined as number | undefined, wantPreLog: true },
  ])('marks $name as pre-log: $wantPreLog', ({ end, wantPreLog }) => {
    const watches = toAnimeWatchViewModels(
      detail({ repetitions: [repetition({ deletedAt: end, lastWatchedAt: undefined, repeatedAt: undefined })] }),
      LOG_START_MS,
    );

    expect(watches[0].isPreLog).toBe(wantPreLog);
  });

  it('never marks the current watch as pre-log', () => {
    const watches = toAnimeWatchViewModels(detail({ repetitions: [] }), LOG_START_MS);

    expect(watches[0].isCurrent).toBe(true);
    expect(watches[0].isPreLog).toBe(false);
  });

  it('reads the past status from the repetition and the live status from the detail', () => {
    const watches = toAnimeWatchViewModels(
      detail({ status: 0, repetitions: [repetition({ status: 1 })] }),
      LOG_START_MS,
    );

    expect(watches[0].statusLabel).toBe('Finalizado');
    expect(watches[0].statusColor).toBe('success');
    expect(watches[1].statusLabel).toBe('Viendo');
    expect(watches[1].statusColor).toBe('accent');
  });

  it('builds the dashed summary from the repetition record of a pre-log watch', () => {
    const watches = toAnimeWatchViewModels(
      detail({
        repetitions: [
          repetition({
            premieredAt: new Date(2021, 6, 3).getTime(),
            lastWatchedAt: new Date(2021, 8, 1).getTime(),
            deletedAt: new Date(2021, 8, 8).getTime(),
          }),
        ],
      }),
      LOG_START_MS,
    );

    expect(watches[0].summary).toEqual({
      started: 'Aug 16, 2021',
      firstWatched: 'Jul 3, 2021',
      lastWatched: 'Sep 1, 2021',
      ended: 'Sep 8, 2021',
    });
  });

  it('leaves the summary off a post-log watch', () => {
    const watches = toAnimeWatchViewModels(
      detail({
        repetitions: [repetition({ deletedAt: new Date(2026, 7, 29).getTime() })],
      }),
      LOG_START_MS,
    );

    expect(watches[0].isPreLog).toBe(false);
    expect(watches[0].summary).toBeUndefined();
  });
});

describe('formatAnimeWatchSummaryDate', () => {
  it.each([
    { name: 'formats a stored timestamp as a short date', value: new Date(2021, 7, 16).getTime(), want: 'Aug 16, 2021' },
    { name: 'falls back to the no-data label when the record holds nothing', value: undefined, want: 'No data' },
  ])('$name', ({ value, want }) => {
    expect(formatAnimeWatchSummaryDate(value)).toBe(want);
  });
});

describe('formatAnimeWatchHistorySubtitle', () => {
  it.each([
    { count: 1, want: '1 watch · episodes recorded since July 5, 2026' },
    { count: 2, want: '2 watches · episodes recorded since July 5, 2026' },
  ])('reads $count as "$want"', ({ count, want }) => {
    expect(formatAnimeWatchHistorySubtitle(count, LOG_START_MS)).toBe(want);
  });
});

describe('buildAnimeWatchEpisodesRequest', () => {
  it('scopes the default-size page to one anime, cycle and cursor', () => {
    expect(buildAnimeWatchEpisodesRequest('anime-1', 2, 'c:1')).toEqual({ animeId: 'anime-1', cycle: 2, cursor: 'c:1', limit: 0 });
  });
});

describe('toAnimeWatchEpisodePages', () => {
  /** One row of the first page. */
  const first = { id: 1 } as WatchHistoryEntry;
  /** One row of an older page. */
  const second = { id: 2 } as WatchHistoryEntry;
  /** The loaded first page, with a next cursor. */
  const loaded: AnimeWatchFirstPage = {
    status: 'success',
    data: { items: [first], nextCursor: 'c:1', status: 'ok' } as WatchHistoryPage,
    error: null,
    isFetching: false,
    isPlaceholderData: false,
    dataUpdatedAt: 10,
  };
  /** Older pages loaded below that same first page. */
  const older: AnimeWatchOlderPages = { requestKey: 'k', firstPageAt: 10, entries: [first, second], nextCursor: undefined };
  /** The input of an enabled, loaded list. */
  const input = { isEnabled: true, firstPage: loaded, older: undefined, requestKey: 'k' };
  /** A pending first page. */
  const pending = { ...loaded, status: 'pending' as const, data: undefined };

  it('shows no rows and no next page while pending, collapsed, failed or on another scope', () => {
    const cases = [
      ['a pending read', { firstPage: pending }, { isLoading: true, error: undefined }],
      ['a collapsed list that never loaded', { isEnabled: false, firstPage: pending }, { isLoading: false, error: undefined }],
      ['another scope still shown', { firstPage: { ...loaded, isPlaceholderData: true } }, { isLoading: true, error: undefined }],
      ['another scope still shown while collapsed', { isEnabled: false, firstPage: { ...loaded, isPlaceholderData: true } }, { isLoading: false, error: undefined }],
      ['a failed read', { firstPage: { ...pending, status: 'error' as const, error: new Error('boom') } }, { isLoading: false, error: new Error('boom') }],
    ] as const;

    for (const [caseName, overrides, expected] of cases) {
      expect.soft(toAnimeWatchEpisodePages({ ...input, ...overrides }), caseName).toEqual({ entries: [], cursor: undefined, ...expected });
    }
  });

  it('shows the first page and its cursor, also once collapsed', () => {
    const expected = { entries: [first], isLoading: false, error: undefined, cursor: 'c:1' };

    expect(toAnimeWatchEpisodePages(input)).toEqual(expected);
    expect(toAnimeWatchEpisodePages({ ...input, isEnabled: false })).toEqual(expected);
  });

  it('shows the older pages and their cursor when they continue this scope and first-page load', () => {
    expect(toAnimeWatchEpisodePages({ ...input, older })).toEqual({ entries: [first, second], isLoading: false, error: undefined, cursor: undefined });
  });

  it('drops older pages loaded for another scope or an earlier first page', () => {
    const cases = [
      ['another scope', { ...older, requestKey: 'other' }],
      ['an earlier first-page load', { ...older, firstPageAt: 9 }],
    ] as const;

    for (const [caseName, stale] of cases) {
      expect.soft(toAnimeWatchEpisodePages({ ...input, older: stale }), caseName).toMatchObject({ entries: [first], cursor: 'c:1' });
    }
  });
});
