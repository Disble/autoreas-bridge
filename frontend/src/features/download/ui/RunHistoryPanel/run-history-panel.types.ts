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
  readonly isSelected: boolean;
  readonly startedLabel: string;
  readonly statusLabel: string;
};

/** Aggregate view model returned by `useRunHistoryPanel`. */
export interface RunHistoryPanelViewModel {
  readonly status: RunHistoryPanelStatus;
  readonly rows: readonly RunHistoryRowViewModel[];
  readonly visibleRows: readonly RunHistoryRowViewModel[];
  readonly canLoadMore: boolean;
  readonly remainingCount: number;
  /** True while a run is still open, which is what reveals the Stop control. */
  readonly runInProgress: boolean;
  readonly selectedRun?: DownloadRunView;
  readonly errorMessage?: string;
}

/** Props for the `RunProgressBar` episode-segments visualisation. */
export interface RunProgressBarProps {
  readonly episodesFound: number;
  readonly episodesDownloaded: number;
  readonly episodesDownloading: number;
  readonly episodesFailed: number;
}
