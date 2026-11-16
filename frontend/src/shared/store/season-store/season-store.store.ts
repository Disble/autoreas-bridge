import { createStore } from 'zustand/vanilla';
import type { SeasonMatchingProgressNotice } from '../../contracts/season.types';
import { SEASON_MATCHING_FIRST_PHASE } from './season-store.constants';
import type { SeasonMatchingRun, SeasonStoreState } from './season-store.types';

/**
 * Advances the ephemeral run count for one resolved row: within the same
 * phase the count grows, and a phase flip restarts it under the new phase so
 * the panel never counts availability resolutions against the name total.
 * Without a run in flight (the scheduled availability refresh) there is
 * nothing to advance.
 * @param run The run the store tracks, null while none is in flight.
 * @param notice The progress event being applied.
 * @returns The advanced run, or null when no run is in flight.
 */
function advanceMatchingRun(run: SeasonMatchingRun | null, notice: SeasonMatchingProgressNotice): SeasonMatchingRun | null {
  if (run === null) {
    return null;
  }
  if (notice.phase !== run.phase) {
    return { total: run.total, resolvedInPhase: 1, phase: notice.phase };
  }
  return { total: run.total, resolvedInPhase: run.resolvedInPhase + 1, phase: run.phase };
}

/**
 * Vanilla backing store for the shared Season read-model: UI state only.
 *
 * The season, its intake rows and the past-seasons list are server state read
 * through `shared/query`, so this store never holds a copy of them. The
 * accessors the rest of the app and its tests use live in the sibling
 * `season-store.helpers.ts`.
 */
export const seasonStore = createStore<SeasonStoreState>()((set) => ({
  viewSeasonId: null,
  readOnly: false,
  errorMessage: undefined,
  busyMessage: undefined,
  matchingRun: null,
  matchingProgress: {},
  lastDiscard: null,
  beginMatchingRun: (total) => {
    set({ matchingRun: { total, resolvedInPhase: 0, phase: SEASON_MATCHING_FIRST_PHASE }, matchingProgress: {} });
  },
  applyMatchingProgress: (notice) => {
    set((state) =>
      state.matchingRun === null
        ? {}
        : {
            matchingRun: advanceMatchingRun(state.matchingRun, notice),
            matchingProgress: { ...state.matchingProgress, [notice.rowId]: notice },
          },
    );
  },
  finishMatchingRun: () => {
    set({ matchingRun: null, matchingProgress: {} });
  },
}));
