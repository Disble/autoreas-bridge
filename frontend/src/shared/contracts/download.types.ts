/**
 * HosterPriorityItem mirrors `contracts.HosterPriorityItem` (Go): a single
 * hoster's user-orderable priority within a site's download preference list.
 */
export interface HosterPriorityItem {
  readonly hoster: string;
  readonly priority: number;
  readonly enabled: boolean;
}

/**
 * JDStatus mirrors `contracts.JDStatus` (Go): the UI-facing view of
 * MyJDownloader connectivity/config. The password is NEVER exposed in
 * cleartext — `hasPassword` is the only signal the UI ever sees.
 */
export interface JDStatus {
  readonly email: string;
  readonly hasPassword: boolean;
  readonly deviceName: string;
  readonly exePathOverride: string;
  readonly defaultDestDir: string;
  readonly lastSeenStatus: string;
  readonly lastSeenAtMs: number;
  readonly lastDecryptError?: string;
}

/**
 * JDConfigInput mirrors `contracts.JDConfigInput` (Go): the write-model
 * `SetJDConfig` accepts. `plaintextPassword` is optional/write-only — pass
 * `undefined` to leave the existing encrypted blob untouched.
 */
export type JDConfigInput = Pick<
  JDStatus,
  'email' | 'deviceName' | 'exePathOverride' | 'defaultDestDir'
> & {
  readonly plaintextPassword?: string;
};

/**
 * ScheduleConfig mirrors `contracts.ScheduleConfig` (Go): the scheduler's
 * persisted cadence plus live next/last-run/running status.
 */
/** Startup-only missed selected-day notice surfaced separately from factual run fields. */
export interface ScheduleMissedNotice {
  readonly localDate: string;
  readonly dueAtMs: number;
  readonly attemptStatus?: string;
}

/** Scheduler-owned Run now / Ignore action result for a startup missed notice. */
export interface ScheduleMissedActionResult {
  readonly kind: string;
  readonly localDate: string;
  readonly terminalStatus?: string;
  readonly settlementReason?: string;
  readonly message?: string;
}

/**
 * ScheduleConfig mirrors `contracts.ScheduleConfig` (Go): the scheduler's
 * persisted cadence plus live next/last-run/running status.
 */
export interface ScheduleConfig {
  readonly mode: string;
  readonly dailyTimeHHMM: string;
  readonly enabled: boolean;
  readonly lastRunAtMs: number;
  readonly lastRunStatus: string;
  readonly nextRunAtMs: number;
  readonly running: boolean;
  /** 7-bit weekday mask (bit0=Sunday..bit6=Saturday; all-days=127) restricting which days fire. */
  readonly enabledWeekdays: number;
  readonly missedNotice?: ScheduleMissedNotice;
}

/**
 * DownloadConfig mirrors `contracts.DownloadConfig` (Go): the aggregate
 * read-model for the download settings screen (JD status, schedule config,
 * hoster priority ordering).
 */
export interface DownloadConfig {
  readonly jd: JDStatus;
  readonly schedule: ScheduleConfig;
  /**
   * The site scope `hosterPriority` was read from. The editor persists back to
   * this exact site so the saved ordering is the one the download engine
   * resolves against.
   */
  readonly hosterPrioritySite: string;
  readonly hosterPriority: readonly HosterPriorityItem[];
}

/** Stable local blocker codes returned by the backend readiness query. */
export type DownloadReadinessReason = 'missing_source' | 'invalid_source' | 'unsupported_source' | 'destination_unresolved';

/** One catalog anime's local download-check readiness. */
export interface AnimeDownloadReadiness {
  readonly animeId: string;
  readonly name: string;
  readonly ready: boolean;
  readonly reasons: readonly DownloadReadinessReason[];
  readonly scheduledToday: boolean;
}

/** Catalog-wide local readiness snapshot returned when Downloads opens. */
export interface DownloadReadinessSnapshot {
  readonly items: readonly AnimeDownloadReadiness[];
  readonly scheduledTotal: number;
  readonly scheduledReady: number;
  readonly scheduledBlocked: number;
}

/**
 * ManualLink mirrors `contracts.ManualLink` (Go): a JD-offline degradation
 * record exposing the raw download links a user must fetch manually.
 */
export interface ManualLink {
  readonly anime: string;
  readonly episode: number;
  readonly links: readonly string[];
}

/**
 * DownloadRunView mirrors `contracts.DownloadRunView` (Go): a single
 * historical `download_runs` row rendered by the run-history master/detail
 * view. `finishedAtMs` is `undefined` while the run is still in progress.
 */
export interface DownloadRunView {
  readonly runId: string;
  readonly startedAtMs: number;
  readonly finishedAtMs?: number;
  readonly trigger: string;
  readonly animesChecked: number;
  readonly episodesFound: number;
  readonly episodesDownloaded: number;
  readonly episodesFailed: number;
  readonly episodesDownloading: number;
  readonly skippedCount: number;
  /** Subset of `animesChecked` that needed no download (nothing new online, or season already complete on disk). */
  readonly upToDateCount: number;
  readonly jdAvailable: boolean;
  readonly status: string;
  readonly errorSummary?: string;
  readonly manualLinks?: readonly ManualLink[];
}
