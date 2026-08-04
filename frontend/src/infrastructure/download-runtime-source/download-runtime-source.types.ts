import type {
  DownloadConfig,
	DownloadRunView,
	DownloadReadinessSnapshot,
  HosterPriorityItem,
  JDConfigInput,
  JDStatus,
  ScheduleConfig,
  ScheduleMissedActionResult,
} from '../../shared/contracts/download.types';

/**
 * Request/reply port for download settings, run history, and lifecycle events.
 */
export interface DownloadRuntimeSource {
  readonly getDownloadConfig: () => Promise<DownloadConfig>;
  readonly getJDStatus: () => Promise<JDStatus>;
  readonly setJDConfig: (input: JDConfigInput) => Promise<string>;
  readonly getScheduleConfig: () => Promise<ScheduleConfig>;
  readonly setScheduleConfig: (config: ScheduleConfig) => Promise<string>;
  readonly setHosterPriority: (site: string, items: readonly HosterPriorityItem[]) => Promise<string>;
  readonly triggerDownloadCheck: () => Promise<string>;
  readonly triggerAnimeDownload: (animeID: string) => Promise<string>;
  readonly runMissedScheduleNow: (localDate: string) => Promise<ScheduleMissedActionResult>;
  readonly ignoreMissedSchedule: (localDate: string) => Promise<ScheduleMissedActionResult>;
	readonly listDownloadRuns: () => Promise<readonly DownloadRunView[]>;
	readonly listDownloadReadiness: () => Promise<DownloadReadinessSnapshot>;
  readonly subscribeRunEvents: (listener: () => void) => () => void;
}
