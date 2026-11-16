import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  SeasonMatchingFinishedNotice,
  SeasonMatchingProgressNotice,
  SeasonMatchingStartedNotice,
  SeasonSource,
} from '../../contracts/season.types';
import {
  connectSeasonMatchingStore,
  disconnectSeasonMatchingStore,
  getSeasonStoreState,
  resetSeasonStore,
  setSeasonStoreState,
} from '../season-store/season-store.helpers';

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
    runMatching: vi.fn().mockResolvedValue('ok'),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
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

  it('records event progress per row without touching any server data', () => {
    const source = createMatchingSource();
    const listeners = connectListeners(source);
    startTrackedRun(listeners);

    listeners.progress(progressNotice());

    expect(getSeasonStoreState().matchingProgress).toEqual({ 'row-1': progressNotice() });
    // The rows belong to the query: the event is stored here and merged over
    // them by `mergeIntakeMatchingProgress`, never written into a store copy.
    expect(source.runMatching).not.toHaveBeenCalled();
  });

  it('clears the progress together with the run on finish and on disconnect', () => {
    const listeners = connectListeners(createMatchingSource());
    startTrackedRun(listeners);
    const notice = progressNotice();
    listeners.progress(notice);
    expect(getSeasonStoreState().matchingProgress).toEqual({ 'row-1': notice });

    listeners.finished({ seasonId: 'season-1' });
    expect(getSeasonStoreState().matchingRun).toBeNull();
    expect(getSeasonStoreState().matchingProgress).toEqual({});

    startTrackedRun(listeners);
    listeners.progress(notice);
    disconnectSeasonMatchingStore();
    expect(getSeasonStoreState().matchingProgress).toEqual({});
  });

  it('counts progress within the phase while the run resolves names', () => {
    const listeners = connectListeners(createMatchingSource());
    startTrackedRun(listeners, 3);

    listeners.progress(progressNotice());
    listeners.progress(progressNotice({ rowId: 'row-2' }));

    expect(getSeasonStoreState().matchingRun).toEqual({ total: 3, resolvedInPhase: 2, phase: 'name_matching' });
  });

  it('renames the phase and restarts the count when the run reaches the availability check', () => {
    const listeners = connectListeners(createMatchingSource());
    startTrackedRun(listeners, 3);
    listeners.progress(progressNotice());
    listeners.progress(progressNotice({ rowId: 'row-2' }));

    listeners.progress(progressNotice({ phase: 'availability_check', availability: 'available', availableEpisodes: 2 }));

    expect(getSeasonStoreState().matchingRun).toEqual({ total: 3, resolvedInPhase: 1, phase: 'availability_check' });
  });

  it('never treats a progress event as proof of a run: without started it records nothing', () => {
    const listeners = connectListeners(createMatchingSource());

    listeners.progress(progressNotice({ phase: 'availability_check', availability: 'available', availableEpisodes: 2 }));

    expect(getSeasonStoreState().matchingRun).toBeNull();
    expect(getSeasonStoreState().matchingProgress).toEqual({});
  });

  /**
   * Guards the read-model boundary: applying one progress event and resolving
   * the terminal signal issue no source call at all. The rows reload through
   * the finished event's query invalidation, so a future persistent side effect
   * added to the lifecycle handlers would be caught here.
   */
  it('issues no source call while progress lands or the terminal signal resolves', () => {
    const source = createMatchingSource();
    const listeners = connectListeners(source);
    startTrackedRun(listeners);

    listeners.progress(progressNotice());
    listeners.finished({ seasonId: 'season-1' });

    expect(source.runMatching).not.toHaveBeenCalled();
    expect(source.reconcileIntake).not.toHaveBeenCalled();
    expect(source.recheckAvailability).not.toHaveBeenCalled();
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
    const source = {} as unknown as SeasonSource;
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' } });

    const disconnect = connectSeasonMatchingStore(source);

    expect(() => disconnect()).not.toThrow();
    disconnectSeasonMatchingStore();
    expect(getSeasonStoreState().matchingRun).toBeNull();
  });

  it('resets the ephemeral run state with the rest of the UI state', () => {
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' }, matchingProgress: { 'row-1': progressNotice() } });

    resetSeasonStore();

    expect(getSeasonStoreState().matchingRun).toBeNull();
    expect(getSeasonStoreState().matchingProgress).toEqual({});
  });
});
