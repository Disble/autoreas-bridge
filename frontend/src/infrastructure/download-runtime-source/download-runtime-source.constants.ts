import type { DownloadConfig, JDStatus, ScheduleConfig, ScheduleMissedActionResult } from '../../shared/contracts/download.types';
import type { DownloadRuntimeSource } from './download-runtime-source.types';

/** Event names that indicate the download run history became stale. */
export const DOWNLOAD_RUN_EVENT_NAMES = ['download.run_started', 'download.run_progress', 'download.run_finished'] as const;

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

/** Safe degraded missed-notice action result returned when Wails is unavailable. */
export function createRuntimeUnavailableMissedActionResult(localDate: string): ScheduleMissedActionResult {
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
  hosterPriority: [],
};

/** Module-local singleton container for the shared download runtime source. */
export const DOWNLOAD_RUNTIME_SOURCE_STATE: { sharedSource: DownloadRuntimeSource | null } = {
  sharedSource: null,
};
