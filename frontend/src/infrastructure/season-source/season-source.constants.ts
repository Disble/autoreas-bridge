import type {
  ApplyScheduleResult,
  ConfirmSelectionResult,
  OrderingBoard,
  SeasonProviderSearchResult,
  SeasonSource,
  SendToVerHoyResult,
} from './season-source.types';

/** Runtime-unavailable sentinel returned by season mutators when Wails is not ready. */
export const SEASON_RUNTIME_UNAVAILABLE = 'runtime unavailable';

/** Safe degraded confirm-selection result returned when Wails is unavailable. */
export const SEASON_CONFIRM_UNAVAILABLE: ConfirmSelectionResult = {
  status: SEASON_RUNTIME_UNAVAILABLE,
  approved: 0,
  rejected: 0,
  quotaExceeded: false,
};

/** Safe degraded send-to-Ver-Hoy result returned when Wails is unavailable. */
export const SEASON_SEND_UNAVAILABLE: SendToVerHoyResult = {
  status: SEASON_RUNTIME_UNAVAILABLE,
  pastDownloadTime: false,
  downloadTime: '',
};

/** Safe degraded provider-search result returned when Wails is unavailable. */
export const SEASON_PROVIDER_SEARCH_UNAVAILABLE: SeasonProviderSearchResult = {
  status: SEASON_RUNTIME_UNAVAILABLE,
  pages: [],
};

/** Empty ordering board used while runtime bindings are unavailable. */
export const SEASON_EMPTY_BOARD: OrderingBoard = { rail: [], grid: [] };

/** Safe degraded apply-schedule result returned when Wails is unavailable. */
export const SEASON_APPLY_UNAVAILABLE: ApplyScheduleResult = {
  status: SEASON_RUNTIME_UNAVAILABLE,
  applied: 0,
  failed: [],
};

/** Module-local singleton container for the shared season source. */
export const SEASON_SOURCE_STATE: { sharedSource: SeasonSource | null } = {
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
