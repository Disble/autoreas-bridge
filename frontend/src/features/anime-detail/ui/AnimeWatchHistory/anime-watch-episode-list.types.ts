import type { WatchHistoryEntry } from '../../../../shared/contracts/anime.types';

/** Props for the resolved rows of one episode list. */
export interface AnimeWatchEpisodeRowsProps {
  /** The accumulated rows, newest first. */
  readonly entries: readonly WatchHistoryEntry[];
  /** True while older keyset pages remain, so a scroll hint renders under the rows. */
  readonly hasMore: boolean;
  /** True for the unscoped All-episodes list, whose rows carry a "Watch K" chip. */
  readonly isTagged: boolean;
}

/** Props for the loading placeholder of one episode list. */
export interface AnimeWatchEpisodeListSkeletonProps {
  /** True for the unscoped All-episodes list, whose placeholder rows reserve the chip column. */
  readonly isTagged: boolean;
}

/** Props for the flat per-anime episode list, optionally scoped to one watch cycle. */
export interface AnimeWatchEpisodeListProps {
  /** The owning anime's id, forwarded to the episodes hook as its request scope. */
  readonly animeId: string;
  /**
   * The watch cycle scoping the list; when passed, every row's chip names it.
   * `undefined` is the All-episodes case: each row's chip names that row's
   * own stored cycle instead.
   */
  readonly cycle?: number;
  /**
   * Gates the backing fetch; a collapsed Accordion item renders disabled so
   * it pays no binding call until it expands. Defaults to true.
   */
  readonly enabled?: boolean;
  /**
   * Marks the list as a post-log past watch: with zero rows it states the
   * episodes were not recorded, never implying none were watched. The parent
   * passes it for every non-current watch; the pre-log branch never reaches
   * the list, and the generic empty state stays for the All-episodes tab.
   */
  readonly isPastWatch?: boolean;
}
