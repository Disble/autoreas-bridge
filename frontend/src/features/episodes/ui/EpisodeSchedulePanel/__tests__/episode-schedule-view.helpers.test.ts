import { describe, expect, it } from 'vitest';
import type { EpisodeScheduleItem } from '../../../../../shared/contracts/episodes.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { toDayBadgeCounts, toEpisodeScheduleView, toVisibleCommandFailure } from '../episode-schedule-panel.helpers';
import type { EpisodeScheduleQueryState } from '../episode-schedule-panel.types';

/** One schedule row. */
const FRIEREN: EpisodeScheduleItem = { animeId: 'anime-1', animeName: 'Frieren', day: 'Viernes', dayOrder: 1, status: 0, episodesWatched: 3, hasCover: false, modified_at: 1000 };

/**
 * A schedule query state with the given overrides.
 * @param overrides The fields that differ from a settled, idle success.
 * @returns The query state.
 */
function queryState(overrides: Partial<EpisodeScheduleQueryState>): EpisodeScheduleQueryState {
  return { status: 'success', data: [], error: null, isFetching: false, isPlaceholderData: false, ...overrides };
}

describe('toEpisodeScheduleView', () => {
  it('is loading while the request is pending (module starting, or no day chosen yet)', () => {
    expect(toEpisodeScheduleView(queryState({ status: 'pending', data: undefined }))).toEqual({ kind: 'loading' });
  });

  it('is loading, not the previous day, while a new day shows placeholder rows', () => {
    expect(toEpisodeScheduleView(queryState({ data: [FRIEREN], isFetching: true, isPlaceholderData: true }))).toEqual({ kind: 'loading' });
  });

  it('is a failure carrying the code and message the read rejected with', () => {
    const view = toEpisodeScheduleView(queryState({ status: 'error', data: undefined, error: createBridgeError('failed_precondition', 'episodes: db closed') }));

    expect(view).toEqual({ kind: 'failure', code: 'failed_precondition', message: 'episodes: db closed' });
  });

  it('is empty only once the day resolved with no rows', () => {
    expect(toEpisodeScheduleView(queryState({ data: [] }))).toEqual({ kind: 'empty' });
  });

  it('is ready with view rows and whether a refetch runs', () => {
    const view = toEpisodeScheduleView(queryState({ data: [FRIEREN], isFetching: true }));

    expect(view).toMatchObject({ kind: 'ready', isRefreshing: true, data: [{ id: 'anime-1', name: 'Frieren' }] });
  });

  it('turns a rejected write into the failure view over any schedule state', () => {
    const view = toEpisodeScheduleView(queryState({ data: [FRIEREN] }), new Map(), 'clipboard unavailable');

    expect(view).toEqual({ kind: 'failure', code: 'internal', message: 'clipboard unavailable' });
  });
});

describe('toDayBadgeCounts', () => {
  it('passes the counts through once they loaded', () => {
    const counts = [{ day: 'Viernes', count: 2 }];

    expect(toDayBadgeCounts({ kind: 'ready', data: counts, isRefreshing: false })).toBe(counts);
  });

  it('shows no badges while the counts are not ready', () => {
    const cases = [
      ['loading', { kind: 'loading' } as const],
      ['empty', { kind: 'empty' } as const],
      ['failed', { kind: 'failure', code: 'unavailable', message: 'starting' } as const],
    ] as const;

    for (const [caseName, view] of cases) {
      expect.soft(toDayBadgeCounts(view), caseName).toEqual([]);
    }
  });
});

describe('toVisibleCommandFailure', () => {
  it('shows a write failure while the schedule data it was raised against is still shown', () => {
    expect(toVisibleCommandFailure({ message: 'conflict', raisedAt: 5 }, 5)).toBe('conflict');
    expect(toVisibleCommandFailure({ message: 'conflict', raisedAt: 7 }, 5)).toBe('conflict');
  });

  it('hides a write failure once the schedule loaded again', () => {
    expect(toVisibleCommandFailure({ message: 'conflict', raisedAt: 5 }, 6)).toBe('');
  });

  it('shows nothing when no write failed', () => {
    expect(toVisibleCommandFailure(undefined, 5)).toBe('');
  });
});
