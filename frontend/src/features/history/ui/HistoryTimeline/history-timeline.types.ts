import type { UIEvent } from 'react';
import type { Anime, WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import type { HistoryDayGroup } from '../../../../shared/watch-history/watch-history.types';
import type { HistoryAnimeScope } from '../HistoryFilterBar/history-filter-bar.types';

/** Semantic HeroUI Chip color tokens owned by the History feature. */
export type HistoryStatusChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** One watch-history entry enriched with the current catalog status for row presentation. */
export interface HistoryTimelineEntry extends WatchHistoryEntry {
  readonly statusLabel?: string;
  readonly statusColor?: HistoryStatusChipColor;
}

/** One day group whose rows carry History-local presentation data. */
export interface HistoryTimelineGroup extends Omit<HistoryDayGroup, 'entries'> {
  readonly entries: readonly HistoryTimelineEntry[];
}

/** Result of resolving the catalog-backed Status and Type filter scope. */
export interface HistoryAnimeScopeLoadState {
  readonly catalog: readonly Anime[] | undefined;
  readonly scope: HistoryAnimeScope | undefined;
  readonly error: Error | undefined;
}

/** State returned by `useHistoryTimeline`: accumulated day groups plus keyset paging status. */
export interface HistoryTimelineState {
  /** Accumulated watch-history rows grouped by local calendar day, newest day first. */
  readonly groups: readonly HistoryTimelineGroup[];
  /** True only while the first page has not resolved yet. */
  readonly isLoading: boolean;
  /** True when a further keyset page is known to exist. */
  readonly hasMore: boolean;
  /** Set when the first page request failed; undefined while loading, empty, or resolved (design D9). */
  readonly error: Error | undefined;
  /** Fetches the next keyset page and appends its rows. */
  readonly fetchNextPage: () => void;
  /** Wired to the scrolling container; fetches the next page on a near-bottom scroll (design D5a). */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
}
