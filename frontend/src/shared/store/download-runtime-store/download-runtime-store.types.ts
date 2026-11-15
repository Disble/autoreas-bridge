/**
 * Renderer-session UI state of the Downloads screen and the missed-day notice
 * (ADR-032 §4): which missed-day decision is hidden or shown as a failure, the
 * notice's action feedback, and the selected run. The schedule config and the
 * run history it decorates are queries (`DOWNLOADS_SCHEDULE_KEY`, `DOWNLOADS_RUNS_KEY`).
 */
export interface DownloadRuntimeStoreState {
  readonly hiddenMissedNoticeDate: string | undefined;
  readonly activeMissedFailureDate: string | undefined;
  readonly shownMissedFailureDates: readonly string[];
  readonly missedNoticeActionMessage: string | undefined;
  readonly missedNoticeIsResolving: boolean;
  readonly selectedRunId: string | undefined;
  readonly hideMissedNoticeDecision: (localDate: string) => void;
  readonly restoreMissedNoticeDecision: () => void;
  readonly showMissedScheduleFailure: (localDate: string) => void;
  readonly clearMissedScheduleFailure: () => void;
  readonly setMissedNoticeActionMessage: (message: string | undefined) => void;
  readonly setMissedNoticeResolving: (isResolving: boolean) => void;
  readonly selectRun: (runId: string) => void;
}
