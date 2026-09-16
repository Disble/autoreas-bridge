import type { AnimeDetail, WatchHistoryEntry } from "../../../../shared/contracts/anime.types";
import { formatDayHeading, formatRowTime, toLocalDayKey } from "../../../../shared/watch-history/watch-history.helpers";

/**
 * Derives the inspector "Added" date (design D8): the first repetition's
 * creation wins because repeating an anime resets the detail `createdAt` to
 * the new watch start (`domain.Anime.Repeat`).
 */
export function deriveHistoryInspectorAddedMs(detail: AnimeDetail): number | undefined {
  return detail.repetitions?.[0]?.createdAt ?? detail.createdAt;
}

/**
 * Derives the inspector "Last watched" date (design D8): the newest recent
 * row wins because the log is History's source of truth; the stored
 * `lastWatchedAt` is only the fallback for a selection with no loaded rows.
 */
export function deriveHistoryInspectorLastWatchedMs(
  detail: AnimeDetail,
  recentRows: readonly WatchHistoryEntry[],
): number | undefined {
  let newest: number | undefined;

  for (const row of recentRows) {
    if (newest === undefined || row.watchedAtMs > newest) {
      newest = row.watchedAtMs;
    }
  }

  return newest ?? detail.lastWatchedAt;
}

/**
 * Formats "Last watched" as day and time together, naming the day relative
 * to `nowMs` when it is today or yesterday (e.g. "Yesterday, 17:16") and in
 * full otherwise (e.g. "September 11, 2026, 20:03").
 */
export function formatHistoryInspectorLastWatched(epochMs: number, nowMs: number = Date.now()): string {
  const dayKey = toLocalDayKey(epochMs);
  const now = new Date(nowMs);
  let day = formatDayHeading(epochMs);

  if (dayKey === toLocalDayKey(nowMs)) {
    day = "Today";
  } else if (dayKey === toLocalDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime())) {
    day = "Yesterday";
  }

  return `${day}, ${formatRowTime(epochMs)}`;
}

/** Formats "Added" as the long-form local day (e.g. "July 31, 2026"). */
export function formatHistoryInspectorAdded(epochMs: number): string {
  return formatDayHeading(epochMs);
}

/**
 * Derives the watched-episodes progress ratio, or `undefined` when the anime
 * has no total to measure against (design D8: the `ProgressBar` renders only
 * with a total).
 */
export function deriveHistoryInspectorProgressRatio(detail: AnimeDetail): number | undefined {
  if (detail.totalEpisodes === undefined || detail.totalEpisodes <= 0) {
    return undefined;
  }

  return detail.episodesWatched / detail.totalEpisodes;
}
