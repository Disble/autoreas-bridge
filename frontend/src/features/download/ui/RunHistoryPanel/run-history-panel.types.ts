import type { DownloadRunView } from '../../../../shared/contracts/download.types';

/** Props for the `RunHistoryPanel` dumb-UI component. */
export interface RunHistoryPanelProps {
  readonly className?: string;
}

/** Loading/empty/error/ready states for the run history list (2026 quality bar). */
export type RunHistoryPanelStatus = 'loading' | 'empty' | 'error' | 'ready';

/** A single row rendered in the master list, with a human-readable label pre-computed. */
export type RunHistoryRowViewModel = Pick<
  DownloadRunView,
  'runId' | 'trigger' | 'episodesDownloaded' | 'episodesFailed'
> & {
  readonly startedLabel: string;
  readonly statusLabel: string;
};

/** Aggregate view model returned by `useRunHistoryPanel`. */
export interface RunHistoryPanelViewModel {
  readonly status: RunHistoryPanelStatus;
  readonly rows: readonly RunHistoryRowViewModel[];
  readonly selectedRun?: DownloadRunView;
  readonly errorMessage?: string;
}
