import { seasonSource } from '../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSnapshot, SeasonSource } from '../../../infrastructure/season-source/season-source.types';
import { SEASON_MATCHING_RUNTIME_STATE } from './season-store.constants';
import { seasonStore } from './season-store.store';
import type { SeasonStoreState } from './season-store.types';

/**
 * isSeasonOpen reports whether a season snapshot is the live, open season.
 *
 * The shared store also holds a closed historical season while the user reads the
 * Season page history (`viewPastSeason`), so `season !== null` is not an open
 * signal. The snapshot's own status is the semantic source of truth, which keeps
 * the Today banner, the Season nav badge and the rating gate on one definition.
 * A missing snapshot reads as not open: the store is hydrated by the Season route
 * alone, so a fresh start stays closed until that route loads the snapshot.
 */
export function isSeasonOpen(season: SeasonSnapshot | null): boolean {
  return season?.status === 'open';
}

/** Reads the current Season store snapshot outside React render. */
export function getSeasonStoreState(): SeasonStoreState {
  return seasonStore.getState();
}

/** Writes a partial Season store snapshot outside React render. */
export function setSeasonStoreState(partial: Partial<SeasonStoreState>): void {
  seasonStore.setState(partial);
}

/** Resets the season read-model back to its initial disconnected state for tests. */
export function resetSeasonStore(): void {
  setSeasonStoreState({
    season: null,
    seasonAnimes: [],
    hasLoaded: false,
    hasLoadedAnimes: false,
    animesLoadState: 'idle',
    errorMessage: undefined,
    busyMessage: undefined,
    matchingRun: null,
    lastDiscard: null,
    viewSeasonId: null,
    readOnly: false,
    pastSeasons: [],
  });
}

/**
 * connectSeasonMatchingStore wires the backend matching lifecycle events
 * into the shared read-model and stays idempotent across multiple panels:
 * started records the run total, progress patches its row in place (never a
 * whole-list refetch per event), and the terminal signal clears the
 * ephemeral run state before the one authoritative row reload. A source
 * without matching subscriptions degrades to a working no-op disconnect.
 */
export function connectSeasonMatchingStore(source: SeasonSource = seasonSource): () => void {
  if (SEASON_MATCHING_RUNTIME_STATE.unsubscribe !== null) {
    return SEASON_MATCHING_RUNTIME_STATE.unsubscribe;
  }

  const unsubscribeStarted =
    source.subscribeMatchingStarted?.((notice) => {
      getSeasonStoreState().beginMatchingRun(notice.total);
    }) ?? (() => undefined);
  const unsubscribeProgress =
    source.subscribeMatchingProgress?.((notice) => {
      getSeasonStoreState().applyMatchingProgress(notice);
    }) ?? (() => undefined);
  const unsubscribeFinished =
    source.subscribeMatchingFinished?.(() => {
      const state = getSeasonStoreState();
      state.finishMatchingRun();
      void state.refreshAnimes(source);
    }) ?? (() => undefined);

  SEASON_MATCHING_RUNTIME_STATE.unsubscribe = () => {
    unsubscribeStarted();
    unsubscribeProgress();
    unsubscribeFinished();
    SEASON_MATCHING_RUNTIME_STATE.unsubscribe = null;
  };

  return SEASON_MATCHING_RUNTIME_STATE.unsubscribe;
}

/**
 * disconnectSeasonMatchingStore releases the matching lifecycle bridge and
 * drops the ephemeral run state with it: the run lives in the session and
 * dies with the panel, never surviving into the next mount.
 */
export function disconnectSeasonMatchingStore(): void {
  SEASON_MATCHING_RUNTIME_STATE.unsubscribe?.();
  SEASON_MATCHING_RUNTIME_STATE.unsubscribe = null;
  setSeasonStoreState({ matchingRun: null });
}
