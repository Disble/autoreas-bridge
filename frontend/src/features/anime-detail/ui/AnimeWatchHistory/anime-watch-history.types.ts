import type { WatchHistoryEntry } from '../../../../shared/contracts/anime.types';

/** Props for the per-anime AnimeWatchHistory section, keyed by the owning anime's id. */
export interface AnimeWatchHistoryProps {
  readonly animeId: string;
}

/** State returned by useAnimeWatchHistory: the anime's most recent watch-history page plus load status. */
export interface AnimeWatchHistoryState {
  readonly entries: readonly WatchHistoryEntry[];
  readonly isLoading: boolean;
  /** True when the page's `nextCursor` proves older rows exist beyond this single page. */
  readonly hasMore: boolean;
  readonly error: Error | undefined;
}
