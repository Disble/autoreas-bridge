import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  SeasonAnimeRow,
  SeasonMatchingFinishedNotice,
  SeasonMatchingProgressNotice,
  SeasonMatchingStartedNotice,
  SeasonSource,
} from '../../../infrastructure/season-source/season-source.types';
import {
  connectSeasonMatchingStore,
  disconnectSeasonMatchingStore,
  getSeasonStoreState,
  resetSeasonStore,
  setSeasonStoreState,
} from '../season-store/season-store.helpers';

/**
 * Builds one editable intake row, so a case states only the fields it patches.
 * @param overrides Per-test row replacements.
 * @returns A pending intake row.
 */
function intakeRow(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'row-1',
    rawName: 'Good Anime',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'waiting',
    availableEpisodes: 0,
    animeId: '',
    section: '',
    sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',
    ...overrides,
  };
}

/**
 * Builds one progress notice, so a case states only the fields under test.
 * @param overrides Per-test notice replacements.
 * @returns A name-matching progress notice for `row-1`.
 */
function progressNotice(overrides: Partial<SeasonMatchingProgressNotice> = {}): SeasonMatchingProgressNotice {
  return {
    seasonId: 'season-1',
    phase: 'name_matching',
    rowId: 'row-1',
    rawName: 'Good Anime',
    matchStatus: 'matched',
    matchedSlug: 'https://jkanime.net/good-anime/',
    candidates: [{ title: 'Good Anime', pageUrl: 'https://jkanime.net/good-anime/', score: 0.98 }],
    availability: 'waiting',
    availableEpisodes: 0,
    ...overrides,
  };
}

/** Every listener a matching source captures, one per lifecycle event. */
interface MatchingListeners {
  /** The started listener the store registered. */
  readonly started: (notice: SeasonMatchingStartedNotice) => void;
  /** The progress listener the store registered. */
  readonly progress: (notice: SeasonMatchingProgressNotice) => void;
  /** The finished listener the store registered. */
  readonly finished: (notice: SeasonMatchingFinishedNotice) => void;
}

/** A season port with assertable matching subscriptions. */
type MatchingSource = SeasonSource & {
  readonly subscribeMatchingStarted: ReturnType<typeof vi.fn>;
  readonly subscribeMatchingProgress: ReturnType<typeof vi.fn>;
  readonly subscribeMatchingFinished: ReturnType<typeof vi.fn>;
};

/**
 * Builds a season port whose matching subscriptions capture their listeners,
 * so a case drives the run by calling them like the backend would.
 * @param overrides Per-test port replacements.
 * @returns A season port with matching subscriptions.
 */
function createMatchingSource(overrides: Partial<SeasonSource> = {}): MatchingSource {
  return {
    getSeasonAnimes: vi.fn().mockResolvedValue([]),
    runMatching: vi.fn().mockResolvedValue('ok'),
    subscribeMatchingStarted: vi.fn().mockReturnValue(() => undefined),
    subscribeMatchingProgress: vi.fn().mockReturnValue(() => undefined),
    subscribeMatchingFinished: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  } as unknown as MatchingSource;
}

/**
 * Connects the store to a matching source and returns the listeners the store
 * registered, so a case emits started/progress/finished directly.
 * @param source The season port to connect through.
 * @returns The captured lifecycle listeners.
 */
function connectListeners(source: MatchingSource): MatchingListeners {
  connectSeasonMatchingStore(source);
  return {
    started: source.subscribeMatchingStarted.mock.calls[0][0] as MatchingListeners['started'],
    progress: source.subscribeMatchingProgress.mock.calls[0][0] as MatchingListeners['progress'],
    finished: source.subscribeMatchingFinished.mock.calls[0][0] as MatchingListeners['finished'],
  };
}

/** Starts a run the store tracks, so a case begins from an in-flight run. */
function startTrackedRun(listeners: MatchingListeners, total = 2): void {
  listeners.started({ seasonId: 'season-1', total });
}

describe('season store matching run', () => {
  beforeEach(() => {
    disconnectSeasonMatchingStore();
    resetSeasonStore();
  });

  it('records the run total with zero resolved in the name-matching phase on started', () => {
    const listeners = connectListeners(createMatchingSource());

    startTrackedRun(listeners, 4);

    expect(getSeasonStoreState().matchingRun).toEqual({ total: 4, resolvedInPhase: 0, phase: 'name_matching' });
  });

  it('patches that row live on progress without refetching the whole list', async () => {
    const source = createMatchingSource();
    const listeners = connectListeners(source);
    setSeasonStoreState({ seasonAnimes: [intakeRow(), intakeRow({ id: 'row-2', rawName: 'Other Anime' })] });
    startTrackedRun(listeners);

    listeners.progress(progressNotice());

    const state = getSeasonStoreState();
    expect(state.seasonAnimes[0]).toMatchObject({
      matchStatus: 'matched',
      matchedSlug: 'https://jkanime.net/good-anime/',
      availability: 'waiting',
    });
    expect(state.seasonAnimes[0]?.candidates).toHaveLength(1);
    expect(state.seasonAnimes[1]).toMatchObject({ id: 'row-2', matchStatus: 'pending' });
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
  });

  it('updates a search_failed row live like any other row', () => {
    const listeners = connectListeners(createMatchingSource());
    setSeasonStoreState({ seasonAnimes: [intakeRow()] });
    startTrackedRun(listeners);

    listeners.progress(progressNotice({ matchStatus: 'search_failed', matchedSlug: '', candidates: [] }));

    expect(getSeasonStoreState().seasonAnimes[0]).toMatchObject({ matchStatus: 'search_failed', matchedSlug: '' });
  });

  it('counts progress within the phase while the run resolves names', () => {
    const listeners = connectListeners(createMatchingSource());
    setSeasonStoreState({ seasonAnimes: [intakeRow()] });
    startTrackedRun(listeners, 3);

    listeners.progress(progressNotice());
    listeners.progress(progressNotice({ rowId: 'row-2' }));

    expect(getSeasonStoreState().matchingRun).toEqual({ total: 3, resolvedInPhase: 2, phase: 'name_matching' });
  });

  it('renames the phase and restarts the count when the run reaches the availability check', () => {
    const listeners = connectListeners(createMatchingSource());
    setSeasonStoreState({ seasonAnimes: [intakeRow()] });
    startTrackedRun(listeners, 3);
    listeners.progress(progressNotice());
    listeners.progress(progressNotice({ rowId: 'row-2' }));

    listeners.progress(progressNotice({ phase: 'availability_check', availability: 'available', availableEpisodes: 2 }));

    expect(getSeasonStoreState().matchingRun).toEqual({ total: 3, resolvedInPhase: 1, phase: 'availability_check' });
    expect(getSeasonStoreState().seasonAnimes[0]).toMatchObject({ availability: 'available', availableEpisodes: 2 });
  });

  it('never treats a progress event as proof of a run: without started it patches the row and starts nothing', () => {
    const source = createMatchingSource();
    const listeners = connectListeners(source);
    setSeasonStoreState({ seasonAnimes: [intakeRow({ matchStatus: 'matched', matchedSlug: 'x' })] });

    listeners.progress(progressNotice({ phase: 'availability_check', availability: 'available', availableEpisodes: 2 }));

    expect(getSeasonStoreState().matchingRun).toBeNull();
    expect(getSeasonStoreState().seasonAnimes[0]).toMatchObject({ availability: 'available', availableEpisodes: 2 });
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
  });

  it('clears the run state and reloads the rows once on finished', async () => {
    const rows = [intakeRow({ matchStatus: 'matched' })];
    const source = createMatchingSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const listeners = connectListeners(source);
    startTrackedRun(listeners);

    listeners.finished({ seasonId: 'season-1' });
    await vi.waitFor(() => expect(source.getSeasonAnimes).toHaveBeenCalledTimes(1));

    expect(getSeasonStoreState().matchingRun).toBeNull();
    expect(getSeasonStoreState().seasonAnimes).toBe(rows);
  });

  it('leaves the progress state when the matching command returns something other than ok', async () => {
    const source = createMatchingSource({ runMatching: vi.fn().mockResolvedValue('searcher unavailable') });
    setSeasonStoreState({ matchingRun: { total: 2, resolvedInPhase: 1, phase: 'name_matching' } });

    await getSeasonStoreState().runMatching(source);

    expect(getSeasonStoreState().matchingRun).toBeNull();
    expect(getSeasonStoreState().errorMessage).toBe('searcher unavailable');
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
  });

  it('leaves the progress state when the matching command throws', async () => {
    const source = createMatchingSource({ runMatching: vi.fn().mockRejectedValue(new Error('boom')) });
    setSeasonStoreState({ matchingRun: { total: 2, resolvedInPhase: 1, phase: 'name_matching' } });

    await getSeasonStoreState().runMatching(source);

    expect(getSeasonStoreState().matchingRun).toBeNull();
    expect(getSeasonStoreState().errorMessage).toBe('boom');
  });

  it('lets the finished event own the reload while a run is in flight when the command returns ok', async () => {
    const source = createMatchingSource();
    setSeasonStoreState({ matchingRun: { total: 2, resolvedInPhase: 2, phase: 'availability_check' } });

    await getSeasonStoreState().runMatching(source);

    expect(getSeasonStoreState().errorMessage).toBeUndefined();
    expect(getSeasonStoreState().matchingRun).not.toBeNull();
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
  });

  it('reloads the rows when the command returns ok but no run ever started', async () => {
    const rows = [intakeRow()];
    const source = createMatchingSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });

    await getSeasonStoreState().runMatching(source);

    expect(getSeasonStoreState().seasonAnimes).toBe(rows);
  });

  it('holds the matching busy message only while the command is in flight', async () => {
    let release: (result: string) => void = () => undefined;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const source = createMatchingSource({ runMatching: vi.fn().mockReturnValue(pending) });

    const request = getSeasonStoreState().runMatching(source);
    expect(getSeasonStoreState().busyMessage).toBe('Matching names against jkanime…');

    release('ok');
    await request;
    expect(getSeasonStoreState().busyMessage).toBeUndefined();
  });

  it('never runs matching while read-only', async () => {
    const source = createMatchingSource();
    setSeasonStoreState({ readOnly: true });

    await getSeasonStoreState().runMatching(source);

    expect(source.runMatching).not.toHaveBeenCalled();
  });

  it('subscribes once however many panels connect', () => {
    const source = createMatchingSource();

    const first = connectSeasonMatchingStore(source);
    const second = connectSeasonMatchingStore(source);

    expect(source.subscribeMatchingStarted).toHaveBeenCalledTimes(1);
    expect(source.subscribeMatchingProgress).toHaveBeenCalledTimes(1);
    expect(source.subscribeMatchingFinished).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('disconnecting unsubscribes every lifecycle event and drops the ephemeral run', () => {
    const startedUnsubscribe = vi.fn();
    const progressUnsubscribe = vi.fn();
    const finishedUnsubscribe = vi.fn();
    const source = createMatchingSource({
      subscribeMatchingStarted: vi.fn().mockReturnValue(startedUnsubscribe),
      subscribeMatchingProgress: vi.fn().mockReturnValue(progressUnsubscribe),
      subscribeMatchingFinished: vi.fn().mockReturnValue(finishedUnsubscribe),
    });
    connectSeasonMatchingStore(source);
    setSeasonStoreState({ matchingRun: { total: 2, resolvedInPhase: 1, phase: 'name_matching' } });

    disconnectSeasonMatchingStore();

    expect(startedUnsubscribe).toHaveBeenCalledTimes(1);
    expect(progressUnsubscribe).toHaveBeenCalledTimes(1);
    expect(finishedUnsubscribe).toHaveBeenCalledTimes(1);
    expect(getSeasonStoreState().matchingRun).toBeNull();
  });

  it('degrades to a working no-op disconnect when the source carries no matching subscriptions', () => {
    const source = { getSeasonAnimes: vi.fn().mockResolvedValue([]) } as unknown as SeasonSource;
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' } });

    const disconnect = connectSeasonMatchingStore(source);

    expect(() => disconnect()).not.toThrow();
    disconnectSeasonMatchingStore();
    expect(getSeasonStoreState().matchingRun).toBeNull();
  });

  it('resets the ephemeral run state with the rest of the read-model', () => {
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' } });

    resetSeasonStore();

    expect(getSeasonStoreState().matchingRun).toBeNull();
  });
});
