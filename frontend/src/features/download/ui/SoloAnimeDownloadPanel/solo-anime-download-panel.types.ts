import type { AnimeDownloadReadiness } from '../../../../shared/contracts/download.types';
import type { ProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window.types';

/** Props for the solo anime download panel. */
export interface SoloAnimeDownloadPanelProps {
  readonly className?: string;
}

/** Which side of the readiness partition the rail is showing. */
export type SoloAnimeDownloadFilter = 'ready' | 'blocked';

/** Ready/blocked totals for the current search, rendered on the tabs. */
export interface SoloAnimeDownloadCounts {
  readonly ready: number;
  readonly blocked: number;
}

/** Row view model rendered by the solo anime selector. */
export interface SoloAnimeDownloadOptionViewModel {
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
  readonly reasonLabels: readonly string[];
  /** Compact tag for the fixed-width status column; undefined on ready rows. */
  readonly statusTag: string | undefined;
}

/** Current lifecycle state for the one-off anime download action. */
export type SoloAnimeDownloadStatus =
  | 'loading'
  | 'ready'
  | 'triggering'
  | 'success'
  | 'already-in-progress'
  | 'readiness-error'
  | 'trigger-error';

/** Internal state shape for the hook. */
export interface SoloAnimeDownloadState {
  readonly items: readonly AnimeDownloadReadiness[];
  readonly query: string;
  readonly filter: SoloAnimeDownloadFilter;
  readonly selectedAnimeID: string | undefined;
  readonly status: SoloAnimeDownloadStatus;
  readonly errorMessage: string | undefined;
}

/** Props for the `SoloAnimeDownloadFilterBar` dumb-UI component. */
export interface SoloAnimeDownloadFilterBarProps {
  readonly query: string;
  readonly filter: SoloAnimeDownloadFilter;
  readonly counts: SoloAnimeDownloadCounts;
  readonly onQueryChange: (query: string) => void;
  readonly onFilterChange: (filter: string) => void;
}

/** Props for the `SoloAnimeDownloadStatusBanner` dumb-UI component. */
export interface SoloAnimeDownloadStatusBannerProps {
  readonly status: SoloAnimeDownloadStatus;
  readonly errorMessage: string | undefined;
  readonly onRetry: () => void;
}

/** Props for the `SoloAnimeDownloadResultRail` dumb-UI component. */
export interface SoloAnimeDownloadResultRailProps {
  readonly status: SoloAnimeDownloadStatus;
  readonly options: readonly SoloAnimeDownloadOptionViewModel[];
  /** Id of the currently selected option, or undefined; only used to highlight its row. */
  readonly selectedId: string | undefined;
  readonly emptyMessage: string;
  readonly listWindow: ProgressiveListWindow;
  readonly onSelectAnime: (animeID: string) => void;
}

/** Props for the `SoloAnimeDownloadSelectionAlert` dumb-UI component. */
export interface SoloAnimeDownloadSelectionAlertProps {
  readonly selected: SoloAnimeDownloadOptionViewModel | undefined;
}

/** Props for the `SoloAnimeDownloadTriggerFeedback` dumb-UI component. */
export interface SoloAnimeDownloadTriggerFeedbackProps {
  readonly status: SoloAnimeDownloadStatus;
}
