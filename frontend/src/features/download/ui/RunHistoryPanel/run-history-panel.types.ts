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
  /** Id of the run still open, used to scope a pending stop to that exact run. */
  readonly runningRunId?: string;
  /**
   * True from the moment a stop is requested until that run reaches a terminal
   * status. Stopping is not instant — the backend cancels the run's context and the
   * pipeline stops at its next boundary — so the control must stay visibly busy
   * rather than looking inert.
   */
  readonly isStopping: boolean;
  readonly selectedRun?: DownloadRunView;
  readonly errorMessage?: string;
}

/** Props for the `RunProgressBar` episode-segments visualisation. */
export interface RunProgressBarProps {
  readonly episodesFound: number;
  readonly episodesDownloaded: number;
  /**
   * The `found - downloaded - failed` remainder. Genuinely in flight while the
   * run is open; genuinely never attempted once it has terminated.
   */
  readonly episodesDownloading: number;
  readonly episodesFailed: number;
  /** Decides whether the pending segment reads as active or as never attempted. */
  readonly isRunning: boolean;
}
