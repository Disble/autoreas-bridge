import type { UIEvent } from 'react';
import type { WatchHistoryEntry } from '../../../../shared/contracts/anime.types';

/** Props for the per-anime AnimeWatchHistory section, keyed by the owning anime's id. */
export interface AnimeWatchHistoryProps {
  readonly animeId: string;
}

/** State returned by useAnimeWatchEpisodes: the anime's accumulated watch-history pages plus load and paging status. */
export interface AnimeWatchEpisodesState {
  readonly entries: readonly WatchHistoryEntry[];
  readonly isLoading: boolean;
  /** True when the last page's `nextCursor` proves older rows exist beyond the accumulated pages. */
  readonly hasMore: boolean;
  readonly error: Error | undefined;
  /** Fetches the next keyset page after `nextCursor`, appending it to `entries`; a no-op without a cursor or while a fetch is in flight. */
  readonly fetchNextPage: () => void;
  /** Scroll handler wiring a near-bottom scroll to `fetchNextPage` (ADR-012 live branch). */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
}
