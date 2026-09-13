import type { UIEvent } from 'react';
import type { Anime, WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import type { HistoryDayGroup } from '../../../../shared/watch-history/watch-history.types';
import type { HistoryAnimeScope, HistoryParams } from '../HistoryFilterBar/history-filter-bar.types';

/** The URL filters that shape the page request; the selection half of `HistoryParams` never refetches. */
export type HistoryTimelineFilters = Pick<HistoryParams, 'search' | 'status' | 'type' | 'range' | 'order'>;

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

/** Selection state `useHistorySelection` derives from the URL for the History `ListBox` (design D5, D7). */
export interface HistorySelectionState {
  /** The highlighted row's key, or `undefined` when nothing loaded matches the URL selection. */
  readonly selectedKey: number | undefined;
  /** Writes the row a `ListBox` key names into the URL selection. */
  readonly onSelect: (key: string | number | undefined) => void;
  /** Opens the anime detail of the row a `ListBox` key names. */
  readonly onOpen: (key: string | number) => void;
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
