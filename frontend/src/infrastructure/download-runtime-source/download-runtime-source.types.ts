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
  /**
   * Reads JDownloader's "Max. simultaneous Downloads" setting. Resolves to 0 when the
   * setting could not be read, which is not a limit of zero but an absent reading.
   */
  readonly getJDMaxSimultaneousDownloads: () => Promise<number>;
  readonly setJDConfig: (input: JDConfigInput) => Promise<string>;
  readonly getScheduleConfig: () => Promise<ScheduleConfig>;
  readonly setScheduleConfig: (config: ScheduleConfig) => Promise<string>;
  readonly setHosterPriority: (site: string, items: readonly HosterPriorityItem[]) => Promise<string>;
  /** Persists the episode auto-rename opt-in. Resolves to "ok" or an error message. */
  readonly setEpisodeRenameEnabled: (enabled: boolean) => Promise<string>;
  readonly triggerDownloadCheck: () => Promise<string>;
  readonly triggerAnimeDownload: (animeID: string) => Promise<string>;
  /** Stops the run currently in flight; resolves "ok" when one was stopped. */
  readonly cancelDownloadRun: () => Promise<string>;
  readonly runMissedScheduleNow: (localDate: string) => Promise<ScheduleMissedActionResult>;
  readonly ignoreMissedSchedule: (localDate: string) => Promise<ScheduleMissedActionResult>;
	readonly listDownloadRuns: () => Promise<readonly DownloadRunView[]>;
	readonly listDownloadReadiness: () => Promise<DownloadReadinessSnapshot>;
  readonly subscribeRunEvents: (listener: () => void) => () => void;
}
