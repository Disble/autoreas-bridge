import type { AnimeDownloadReadiness } from '../../../../shared/contracts/download.types';

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
