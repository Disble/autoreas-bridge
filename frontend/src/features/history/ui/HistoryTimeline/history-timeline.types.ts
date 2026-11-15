import type { UIEvent } from 'react';
import type { Anime, WatchHistoryEntry, WatchHistoryPage } from '../../../../shared/contracts/anime.types';
import type { AsyncViewSource } from '../../../../shared/query/async-view/async-view.types';
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

/** The catalog read as History consumes it: the loaded rows, or the failure. */
export interface HistoryCatalogLoad {
  /** The loaded catalog; undefined while loading or after a failure. */
  readonly catalog: readonly Anime[] | undefined;
  /** The failure to show; set only when the read failed. */
  readonly error: Error | undefined;
}

/** Result of resolving the catalog-backed Status and Type filter scope. */
export interface HistoryAnimeScopeLoadState {
  readonly catalog: readonly Anime[] | undefined;
  readonly scope: HistoryAnimeScope | undefined;
  readonly error: Error | undefined;
}

/** The first-page query as the timeline reads it (a `useBridgeQuery` result fits it). */
export type HistoryFirstPage = AsyncViewSource<WatchHistoryPage> & {
  /** True while the previous request's page is still shown for a new request. */
  readonly isPlaceholderData: boolean;
  /** When the first page last loaded; older pages belong to that load only. */
  readonly dataUpdatedAt: number;
};

/** The older keyset pages loaded below one first page, for one request and one first-page load. */
export interface HistoryOlderPages {
  /** The JSON of the first-page request the older pages continue. */
  readonly requestKey: string;
  /** The `dataUpdatedAt` of the first page they continue. */
  readonly firstPageAt: number;
  /** Every row shown: the first page's, then the older pages', oldest page last. */
  readonly entries: readonly WatchHistoryEntry[];
  /** The cursor of the next older page; undefined when there is none or paging stopped on a failure. */
  readonly nextCursor: string | undefined;
}

/** Everything `toHistoryTimelinePages` reads. */
export interface HistoryTimelinePagesInput {
  /** The catalog load failure, which fails the whole timeline. */
  readonly catalogError: Error | undefined;
  /** The resolved Status/Type scope; undefined until the catalog loads. */
  readonly scope: HistoryAnimeScope | undefined;
  readonly firstPage: HistoryFirstPage;
  readonly older: HistoryOlderPages | undefined;
  /** The JSON of the current first-page request; undefined when no page is read. */
  readonly requestKey: string | undefined;
}

/** What the timeline shows for one request: its rows, its loading and failure state, and the next cursor. */
export interface HistoryTimelinePages {
  /** Every row shown, which a next page extends. */
  readonly entries: readonly WatchHistoryEntry[];
  readonly isLoading: boolean;
  readonly error: Error | undefined;
  /** The cursor `fetchNextPage` reads next; undefined when there is no further page. */
  readonly cursor: string | undefined;
}

/** Selection state `useHistorySelection` derives from the URL for the History `ListBox` (design D5, D7). */
export interface HistorySelectionState {
  /** The highlighted row's key, or `undefined` when nothing loaded matches the URL selection. */
  readonly selectedKey: number | undefined;
  /** Writes the row a `ListBox` key names into the URL selection. */
  readonly onSelect: (key: string | number | undefined) => void;
  /** Opens the anime detail of the row a `ListBox` key names. */
  readonly onOpen: (key: string | number) => void;
  /**
   * Opens the row an Enter or double-click gesture landed on, resolved from
   * the DOM event target with the settled selection as the fallback; arms a
   * one-shot suppress for React Aria's post-gesture selection echo.
   */
  readonly onOpenTarget: (target: unknown) => void;
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
