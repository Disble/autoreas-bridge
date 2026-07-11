import type {
  ApplyScheduleResult,
  ConfirmSelectionResult,
  OrderingBoard,
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
