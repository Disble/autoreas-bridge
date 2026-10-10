import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSnapshot, SeasonSource } from '../../../infrastructure/season-source/season-source.types';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../season-store/season-store.helpers';

/** Rows the stand-in port serves, enough to tell a loaded list from the empty one. */
const ROWS = [{ id: 'row-1' }] as unknown as readonly SeasonAnimeRow[];

/** A closed historical season, as the read-only view holds it. */
const PAST_SEASON: SeasonSnapshot = { id: 'past', name: 'Abril 2026', minApprovalGrade: 4, slots: 12, status: 'closed', createdAt: 1 };

/** Builds a port stand-in exposing only the reads this suite drives. */
function makeSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    listSeasons: vi.fn().mockResolvedValue([]),
    getSeasonAnimes: vi.fn().mockResolvedValue(ROWS),
    getPastSeason: vi.fn().mockResolvedValue(PAST_SEASON),
    getPastSeasonAnimes: vi.fn().mockResolvedValue(ROWS),
    ...overrides,
  } as unknown as SeasonSource;
}

/** Reads the animes request state the store currently reports. */
function loadState() {
  return getSeasonStoreState().animesLoadState;
}

/** Starts a request that stays pending until the returned `settle` / `fail` is called. */
function deferredRows() {
  let settle: (rows: readonly SeasonAnimeRow[]) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const promise = new Promise<readonly SeasonAnimeRow[]>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

describe('season store animes load state', () => {
  beforeEach(() => {
    resetSeasonStore();
  });

  it('starts idle, both as a fresh store and after a reset', async () => {
    vi.resetModules();
    const { seasonStore } = await import('../season-store/season-store.store');

    expect(seasonStore.getState().animesLoadState).toBe('idle');
    expect(loadState()).toBe('idle');
  });

  it.each(['refreshAnimes', 'ensureAnimesLoaded'] as const)('%s moves idle → loading → loaded', async (action) => {
    const pending = deferredRows();
    const source = makeSource({ getSeasonAnimes: vi.fn().mockReturnValue(pending.promise) });

    const request = getSeasonStoreState()[action](source);
    expect(loadState()).toBe('loading');

    pending.settle(ROWS);
    await request;
    expect(loadState()).toBe('loaded');
    expect(getSeasonStoreState().seasonAnimes).toBe(ROWS);
  });

  it.each(['refreshAnimes', 'ensureAnimesLoaded'] as const)('%s moves loading → failed and reports the error', async (action) => {
    const pending = deferredRows();
    const source = makeSource({ getSeasonAnimes: vi.fn().mockReturnValue(pending.promise) });

    const request = getSeasonStoreState()[action](source);
    pending.fail(new Error('boom'));
    await request;

    expect(loadState()).toBe('failed');
    expect(getSeasonStoreState().errorMessage).toBe(action === 'refreshAnimes' ? 'boom' : 'Failed to load intake rows');
  });

  it('refreshAnimes falls back to a generic message for a non-Error rejection', async () => {
    const source = makeSource({ getSeasonAnimes: vi.fn().mockRejectedValue('nope') });

    await getSeasonStoreState().refreshAnimes(source);

    expect(getSeasonStoreState().errorMessage).toBe('Failed to load intake rows');
  });

  it.each(['refreshAnimes', 'ensureAnimesLoaded'] as const)('%s moves failed → loading on retry', async (action) => {
    const pending = deferredRows();
    const getSeasonAnimes = vi.fn().mockRejectedValueOnce(new Error('boom')).mockReturnValue(pending.promise);
    const source = makeSource({ getSeasonAnimes });
    await getSeasonStoreState()[action](source);
    expect(loadState()).toBe('failed');

    const retry = getSeasonStoreState()[action](source);
    expect(loadState()).toBe('loading');

    pending.settle(ROWS);
    await retry;
    expect(loadState()).toBe('loaded');
  });

  it.each(['refreshAnimes', 'ensureAnimesLoaded'] as const)('%s keeps a loaded list loaded while in flight and after a failure', async (action) => {
    setSeasonStoreState({ animesLoadState: 'loaded', hasLoadedAnimes: false, seasonAnimes: ROWS });
    const pending = deferredRows();
    const source = makeSource({ getSeasonAnimes: vi.fn().mockReturnValue(pending.promise) });

    const request = getSeasonStoreState()[action](source);
    expect(loadState()).toBe('loaded');

    pending.fail(new Error('boom'));
    await request;
    expect(loadState()).toBe('loaded');
    expect(getSeasonStoreState().seasonAnimes).toBe(ROWS);
  });

  it('ensureAnimesLoaded de-duplicates concurrent callers into one request', async () => {
    const getSeasonAnimes = vi.fn().mockResolvedValue(ROWS);
    const source = makeSource({ getSeasonAnimes });

    await Promise.all([getSeasonStoreState().ensureAnimesLoaded(source), getSeasonStoreState().ensureAnimesLoaded(source)]);

    expect(getSeasonAnimes).toHaveBeenCalledTimes(1);
    expect(loadState()).toBe('loaded');
  });

  it.each(['refreshAnimes', 'ensureAnimesLoaded'] as const)('%s leaves the state alone while a past season is viewed', async (action) => {
    setSeasonStoreState({ viewSeasonId: 'past' });
    const getSeasonAnimes = vi.fn();

    await getSeasonStoreState()[action](makeSource({ getSeasonAnimes }));

    expect(getSeasonAnimes).not.toHaveBeenCalled();
    expect(loadState()).toBe('idle');
  });

  it('viewPastSeason loads season and animes together and reports loaded', async () => {
    await getSeasonStoreState().viewPastSeason(makeSource(), 'past');

    expect(loadState()).toBe('loaded');
    expect(getSeasonStoreState().seasonAnimes).toBe(ROWS);
  });

  it('viewPastSeason leaves the state untouched when the load fails', async () => {
    const source = makeSource({ getPastSeasonAnimes: vi.fn().mockRejectedValue(new Error('boom')) });

    await getSeasonStoreState().viewPastSeason(source, 'past');

    expect(loadState()).toBe('idle');
  });

  it('exitPastSeason clears the animes and returns to idle', async () => {
    await getSeasonStoreState().viewPastSeason(makeSource(), 'past');

    await getSeasonStoreState().exitPastSeason(makeSource());

    expect(loadState()).toBe('idle');
    expect(getSeasonStoreState().seasonAnimes).toEqual([]);
  });

  it('ensureAnimesLoaded requests the live animes again after leaving a past season', async () => {
    await getSeasonStoreState().viewPastSeason(makeSource(), 'past');
    await getSeasonStoreState().exitPastSeason(makeSource());
    const getSeasonAnimes = vi.fn().mockResolvedValue(ROWS);

    await getSeasonStoreState().ensureAnimesLoaded(makeSource({ getSeasonAnimes }));

    expect(getSeasonAnimes).toHaveBeenCalledTimes(1);
    expect(loadState()).toBe('loaded');
  });
});
