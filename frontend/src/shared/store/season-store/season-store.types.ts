import type { SeasonMatchingPhase, SeasonMatchingProgressNotice } from '../../contracts/season.types';

/**
 * Ephemeral matching-run progress: the run total plus how many rows resolved
 * in the current phase. Session-only by an explicit decision -- never
 * persisted, never written to the backend, gone when the panel goes away --
 * and carrying no per-state counters, which stay derived from the rows.
 */
export interface SeasonMatchingRun {
  /** How many rows this run will attempt, from the started event. */
  readonly total: number;
  /** How many rows resolved in the current phase so far. */
  readonly resolvedInPhase: number;
  /** The phase the latest resolved row belongs to, naming the progress. */
  readonly phase: SeasonMatchingPhase;
}

/**
 * The latest successful intake discard, so the notification pipeline can offer
 * its Undo. Session-only; `sequence` grows with every discard, so discarding the
 * same row twice still reads as a new notice.
 */
export interface SeasonDiscardNotice {
  /** The discarded intake row. */
  readonly rowId: string;
  /** The row's name when it was discarded; empty when the row was not in the list. */
  readonly rawName: string;
  /** 1 for the session's first discard, then one more for each. */
  readonly sequence: number;
}

/**
 * Zustand state contract for the shared Season read-model: UI state only.
 *
 * The season, its intake rows and the past-seasons list are server state and
 * live in `shared/query` (ADR-032), read through `useDisplayedSeason`,
 * `useDisplayedSeasonAnimes` and `useSeasonList`. Nothing here copies them, so
 * a stale copy can never disagree with the read the screens show.
 */
export type SeasonStoreState = {
  /** The past season being viewed read-only, or null for the live season. */
  readonly viewSeasonId: string | null;
  /** Whether the screens are read-only because a past season is viewed. */
  readonly readOnly: boolean;
  /** The shared season banner text, cleared by the command that resolved it. */
  readonly errorMessage?: string;
  /** The long-running command the screens announce, null while nothing runs. */
  readonly busyMessage?: string;
  /** Ephemeral matching-run progress, null while no run is in flight. */
  readonly matchingRun: SeasonMatchingRun | null;
  /** Latest event progress per row for the active run, never server rows. */
  readonly matchingProgress: Readonly<Record<string, SeasonMatchingProgressNotice>>;
  /** The latest successful intake discard, null until one succeeds. */
  readonly lastDiscard: SeasonDiscardNotice | null;
  /** Records the run total a started event opened, resetting the phase count. */
  readonly beginMatchingRun: (total: number) => void;
  /**
   * Records this run's latest progress for one row and advances the phase
   * count. A progress event with no run around it (the scheduled availability
   * refresh) records nothing.
   */
  readonly applyMatchingProgress: (notice: SeasonMatchingProgressNotice) => void;
  /** Drops the ephemeral run state, e.g. on the terminal signal. */
  readonly finishMatchingRun: () => void;
};
