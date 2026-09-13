import type { WatchHistoryEntry } from '../contracts/anime.types';

/**
 * One local calendar day's worth of watch-history rows, newest day first
 * (Anime History spec, "Episode Timeline Is Grouped By Day"). Rows within
 * the day are newest first too.
 */
export interface HistoryDayGroup {
  /** Local calendar-day key (e.g. "2026-09-12") used to detect a day boundary. */
  readonly dayKey: string;
  /** Human-readable heading for the day, derived from the same timestamp family as its rows. */
  readonly heading: string;
  /** Number of rows loaded so far for this day. Exact for a complete group; may still grow for a partial one. */
  readonly count: number;
  /** True only for the trailing (oldest loaded) group, whose count may still grow on the next page. */
  readonly partial: boolean;
  /** The day's rows, newest first. */
  readonly entries: readonly WatchHistoryEntry[];
}
