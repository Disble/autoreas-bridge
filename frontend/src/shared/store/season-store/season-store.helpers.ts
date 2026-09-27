import type { SeasonSnapshot } from '../../../infrastructure/season-source/season-source.types';
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
    errorMessage: undefined,
    busyMessage: undefined,
    viewSeasonId: null,
    readOnly: false,
    pastSeasons: [],
  });
}
