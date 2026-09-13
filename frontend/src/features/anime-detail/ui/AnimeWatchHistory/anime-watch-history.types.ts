import type { UIEvent } from 'react';
import type { AnimeDetail, WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import type { HeroChipColor } from '../AnimeDetail/anime-detail.types';

/** Props for the per-anime AnimeWatchHistory section, keyed by the owning anime's id. */
export interface AnimeWatchHistoryProps {
  readonly animeId: string;
  /** Raw detail DTO feeding the per-watch view models; the parent mounts this section only once loaded. */
  readonly detail: AnimeDetail;
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

/** Dashed pre-log summary dates for one watch that closed before the watch-history log began. */
export interface AnimeWatchSummary {
  readonly started: string;
  readonly premiere: string;
  readonly lastWatched: string;
  readonly ended: string;
}

/**
 * One watch through a series for the By-watch Accordion: past watches come
 * from the stored repetitions (watch `i + 1` after a stable `numRepetitions`
 * sort), and the live watch is always last and current.
 */
export interface AnimeWatchViewModel {
  readonly key: string;
  readonly number: number;
  readonly isCurrent: boolean;
  /** True when a past watch ended before `WATCH_HISTORY_LOG_START_MS`; never true for the live watch. */
  readonly isPreLog: boolean;
  readonly statusLabel: string;
  readonly statusColor: HeroChipColor;
  /** Display-ready `createdAt` → end span (the live watch ends at `lastWatchedAt`). */
  readonly spanLabel: string;
  /** "X of Y episodes", or "X episodes" when the anime has no total. */
  readonly episodesLabel: string;
  /** 0-100 progress against the anime total; absent without a total. */
  readonly progressRatio?: number;
  /** Present only on pre-log past watches, feeding the dashed summary. */
  readonly summary?: AnimeWatchSummary;
}

/** Props for the dashed pre-log summary of one watch, rendered instead of episode rows. */
export interface AnimeWatchSummaryProps {
  readonly watchNumber: number;
  readonly summary: AnimeWatchSummary;
}
