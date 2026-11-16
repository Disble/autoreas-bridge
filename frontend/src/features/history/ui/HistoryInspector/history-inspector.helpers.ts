import type { AnimeDetail, WatchHistoryEntry } from "../../../../shared/contracts/anime.types";
import { formatDayHeading, formatRowTime, toLocalDayKey } from "../../../../shared/watch-history/watch-history.helpers";
import { HISTORY_INSPECTOR_NO_EPISODES } from "./history-inspector.constants";
import type { HistoryInspectorRead, HistoryInspectorState, HistoryInspectorStateInput } from "./history-inspector.types";

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

/**
 * The selected anime's own loaded answer: undefined while the read is pending,
 * failed, or still shows the previous selection's answer, so arrow-keying
 * through rows never shows another anime's data.
 *
 * @param read One inspector query.
 * @returns The loaded data, or undefined.
 */
export function toInspectedData<TData>(read: HistoryInspectorRead<TData>): TData | undefined {
  return read.status === "success" && !read.isPlaceholderData ? read.data : undefined;
}

/**
 * Derives the exclusive inspector state (design D8): `prompt` with no
 * selection; `error` when the detail read failed (an unknown anime, or the
 * anime module failed); `loading` while it is pending (also while the module
 * starts) or still shows the previous selection; `content` otherwise. The
 * 3-row recent page is supplementary: until it loads, and when it fails, it
 * reads as no rows while the detail-driven state stands.
 *
 * @param input The selection, its detail and recent-page queries and its cover.
 * @returns The inspector state.
 */
export function toHistoryInspectorState({ animeId, detail, recent, cover }: HistoryInspectorStateInput): HistoryInspectorState {
  const recentEpisodes = toInspectedData(recent)?.items ?? HISTORY_INSPECTOR_NO_EPISODES;
  const none = { detail: undefined, addedMs: undefined, lastWatchedMs: undefined, cover };
  if (animeId === undefined) {
    return { status: "prompt", ...none, recentEpisodes: HISTORY_INSPECTOR_NO_EPISODES };
  }
  if (detail.status === "error") {
    return { status: "error", ...none, recentEpisodes };
  }

  const loaded = toInspectedData(detail);
  if (loaded === undefined) {
    return { status: "loading", ...none, recentEpisodes };
  }

  return {
    status: "content",
    detail: loaded,
    addedMs: deriveHistoryInspectorAddedMs(loaded),
    lastWatchedMs: deriveHistoryInspectorLastWatchedMs(loaded, recentEpisodes),
    cover,
    recentEpisodes,
  };
}
