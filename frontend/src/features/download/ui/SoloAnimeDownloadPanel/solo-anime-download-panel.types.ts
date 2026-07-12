import type { Anime } from '../../../../shared/contracts/anime.types';

/** Props for the solo anime download panel. */
export interface SoloAnimeDownloadPanelProps {
  readonly className?: string;
}

/** Row view model rendered by the solo anime selector. */
export interface SoloAnimeDownloadOptionViewModel {
  readonly id: string;
  readonly name: string;
  readonly progressLabel: string;
  readonly canDownload: boolean;
  readonly gapLabel: string | undefined;
}

/** Current lifecycle state for the one-off anime download action. */
export type SoloAnimeDownloadStatus = 'loading' | 'ready' | 'triggering' | 'success' | 'already-in-progress' | 'error';

/** Internal state shape for the hook. */
export interface SoloAnimeDownloadState {
  readonly items: readonly Anime[];
  readonly query: string;
  readonly selectedAnimeID: string | undefined;
  readonly status: SoloAnimeDownloadStatus;
  readonly errorMessage: string | undefined;
}
