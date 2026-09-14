import { describe, expect, it } from 'vitest';

import type { AnimeDetail, AnimeRepeticion } from '../../../../../shared/contracts/anime.types';
import { formatAnimeWatchHistorySubtitle, formatAnimeWatchSummaryDate, toAnimeWatchViewModels } from '../anime-watch-history.helpers';

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
      premiere: 'Jul 3, 2021',
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
