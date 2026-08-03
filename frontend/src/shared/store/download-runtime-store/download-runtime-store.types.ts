import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { DownloadRunView, ScheduleConfig } from '../../contracts/download.types';

/** Zustand read-model for the Downloads screen. */
export interface DownloadRuntimeStoreState {
  readonly scheduleConfig: ScheduleConfig;
  readonly scheduleHasLoaded: boolean;
  readonly scheduleErrorMessage: string | undefined;
  readonly hiddenMissedNoticeDate: string | undefined;
  readonly activeMissedFailureDate: string | undefined;
  readonly shownMissedFailureDates: readonly string[];
  readonly missedNoticeActionMessage: string | undefined;
  readonly missedNoticeIsResolving: boolean;
  readonly runHistory: readonly DownloadRunView[];
  readonly runHistoryHasLoaded: boolean;
  readonly runHistoryErrorMessage: string | undefined;
  readonly selectedRunId: string | undefined;
  readonly refreshSchedule: (source: DownloadRuntimeSource) => Promise<void>;
  readonly refreshRunHistory: (source: DownloadRuntimeSource) => Promise<void>;
  readonly hideMissedNoticeDecision: (localDate: string) => void;
  readonly restoreMissedNoticeDecision: () => void;
  readonly showMissedScheduleFailure: (localDate: string) => void;
  readonly clearMissedScheduleFailure: () => void;
  readonly setMissedNoticeActionMessage: (message: string | undefined) => void;
  readonly setMissedNoticeResolving: (isResolving: boolean) => void;
  readonly selectRun: (runId: string) => void;
}
