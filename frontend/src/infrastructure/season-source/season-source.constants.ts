import type { SeasonQuerySource, SeasonSource } from '../../shared/contracts/season.types';

/** Runtime-unavailable sentinel returned by season mutators when Wails is not ready. */
export const SEASON_RUNTIME_UNAVAILABLE = 'runtime unavailable';

/**
 * Status a season command resolves to once its binding returned without an
 * error: the season commands' consumers still read a status string, so the
 * adapter keeps answering the one the binding used to return.
 */
export const SEASON_COMMAND_OK = 'ok';

/** Module-local singleton container for the shared season source. */
export const SEASON_SOURCE_STATE: { sharedSource: (SeasonSource & SeasonQuerySource) | null } = {
  sharedSource: null,
};

/**
 * Runtime event a matching run opens with, carrying the run total
 * (`internal/events/event.go`: `season.matching_started`).
 */
export const SEASON_MATCHING_STARTED_EVENT_NAME = 'season.matching_started';

/**
 * Runtime event published once per attempted row, in the phase the row just
 * resolved in (`internal/events/event.go`: `season.matching_progress`).
 */
export const SEASON_MATCHING_PROGRESS_EVENT_NAME = 'season.matching_progress';

/**
 * Terminal runtime event of a matching run, after both phases have completed
 * (`internal/events/event.go`: `season.matching_finished`).
 */
export const SEASON_MATCHING_FINISHED_EVENT_NAME = 'season.matching_finished';

/**
 * Progress phase for rows resolved by name matching
 * (`internal/events/event.go`: `SeasonMatchingPhaseMatching`).
 */
export const SEASON_MATCHING_PHASE_MATCHING = 'name_matching';

/**
 * Progress phase for rows resolved by the availability check
 * (`internal/events/event.go`: `SeasonMatchingPhaseAvailabilityCheck`).
 */
export const SEASON_MATCHING_PHASE_AVAILABILITY_CHECK = 'availability_check';
