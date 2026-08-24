import type { DownloadConfig, JDStatus, ScheduleConfig, ScheduleMissedActionResult } from '../../shared/contracts/download.types';
import type { DownloadRuntimeSource } from './download-runtime-source.types';

/** Event names that indicate the download run history became stale. */
export const DOWNLOAD_RUN_EVENT_NAMES = [
  'download.run_started',
  'download.run_progress',
  'download.run_finished',
  'download.episode_available',
  'download.episode_downloaded',
  'download.failed',
  'download.skipped',
  'download.jd_status',
  'download.episode_downloading',
] as const;

/**
 * Event name the backend emits when a startup-missed selected day settles
 * (`missedScheduleSettledEventName`, `app_notification_center.go`). Kept out of
 * `DOWNLOAD_RUN_EVENT_NAMES` on purpose: those mean the run history went stale,
 * and settling a missed day is not a run.
 */
export const MISSED_SCHEDULE_SETTLED_EVENT_NAME = 'schedule.missed_settled';

/** Safe degraded JD status returned when Wails is unavailable. */
export const EMPTY_JD_STATUS: JDStatus = {
  email: '',
  hasPassword: false,
  deviceName: '',
  exePathOverride: '',
  defaultDestDir: '',
  lastSeenStatus: 'unknown',
  lastSeenAtMs: 0,
};

/** Safe degraded schedule config returned when Wails is unavailable. */
export const EMPTY_SCHEDULE_CONFIG: ScheduleConfig = {
  mode: 'manual',
  dailyTimeHHMM: '',
  enabled: false,
  lastRunAtMs: 0,
  lastRunStatus: '',
  nextRunAtMs: 0,
  running: false,
  enabledWeekdays: 127,
  missedNotice: undefined,
};

/**
 * Safe degraded missed-notice action result returned when Wails is unavailable.
 *
 * It is a function only because the shape carries the date it was asked about;
 * it is otherwise the same kind of thing as `EMPTY_JD_STATUS`,
 * `EMPTY_SCHEDULE_CONFIG` and `EMPTY_DOWNLOAD_CONFIG` directly above it -- the
 * degraded default this module exists to hold. Moving the parametrized member
 * of that family into `.helpers` would split one set of degraded defaults
 * across two files to satisfy a shape rule about how it is spelled.
 */
export function createRuntimeUnavailableMissedActionResult(localDate: string): ScheduleMissedActionResult { // eslint-disable-line dharness/role-file-shape -- see the block above: a parametrized member of this file's degraded-defaults family
  return {
    kind: 'error',
    localDate,
    message: 'runtime unavailable',
  };
}

/** Safe degraded download config returned when Wails is unavailable. */
export const EMPTY_DOWNLOAD_CONFIG: DownloadConfig = {
  jd: EMPTY_JD_STATUS,
  schedule: EMPTY_SCHEDULE_CONFIG,
  // No runtime means no site to save to; the editor refuses to persist rather
  // than inventing a scope the download engine would never read.
  hosterPrioritySite: '',
  hosterPriority: [],
  renameEpisodes: false,
};

/** Module-local singleton container for the shared download runtime source. */
export const DOWNLOAD_RUNTIME_SOURCE_STATE: { sharedSource: DownloadRuntimeSource | null } = {
  sharedSource: null,
};
