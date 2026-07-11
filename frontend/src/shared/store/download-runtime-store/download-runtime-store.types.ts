import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source';
import type { DownloadRunView, ScheduleConfig } from '../../contracts/download.types';

/** Zustand read-model for the Downloads screen. */
export interface DownloadRuntimeStoreState {
  readonly scheduleConfig: ScheduleConfig;
  readonly scheduleHasLoaded: boolean;
  readonly scheduleErrorMessage: string | undefined;
  readonly runHistory: readonly DownloadRunView[];
  readonly runHistoryHasLoaded: boolean;
  readonly runHistoryErrorMessage: string | undefined;
  readonly selectedRunId: string | undefined;
  readonly refreshSchedule: (source: DownloadRuntimeSource) => Promise<void>;
  readonly refreshRunHistory: (source: DownloadRuntimeSource) => Promise<void>;
  readonly selectRun: (runId: string) => void;
}
