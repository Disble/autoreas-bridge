import type { AnimeDetail, AnimeRepeticion } from '../../../../shared/contracts/anime.types';
import {
  formatAnimeDetailProgressRatio,
  getAnimeDetailEstadoColor,
  getAnimeDetailEstadoLabel,
} from '../AnimeDetail/anime-detail.helpers';
import { ANIME_DETAIL_NO_DATA_LABEL, ANIME_DETAIL_UNKNOWN_LABEL } from '../AnimeDetail/anime-detail.constants';
import { ANIME_WATCH_HISTORY_SPAN_SEPARATOR } from './anime-watch-history.constants';
import { WATCH_HISTORY_LOG_START_MS } from '../../../../shared/watch-history/watch-history.constants';
import { formatCompactDateRange, formatDayHeading, formatEpisodeCount, formatShortDate } from '../../../../shared/watch-history/watch-history.helpers';
import type { AnimeWatchSummary, AnimeWatchViewModel } from './anime-watch-history.types';

/**
 * Ends a past watch at the most authoritative recorded date: the deletion
 * that closed it, falling back to the last watched episode and finally to
 * the repeat that superseded it.
 */
function endOfPastWatch(entry: AnimeRepeticion): number | undefined {
  return entry.deletedAt ?? entry.lastWatchedAt ?? entry.repeatedAt;
}

/**
 * Renders a watch span compactly (e.g. "Aug 29 – Sep 11, 2026"); an undated
 * half degrades to "Unknown" beside the other half's full short date.
 */
function formatWatchSpan(startMs: number | undefined, endMs: number | undefined): string {
  if (startMs !== undefined && endMs !== undefined) {
    return formatCompactDateRange(startMs, endMs);
  }

  const start = startMs === undefined ? ANIME_DETAIL_UNKNOWN_LABEL : formatShortDate(startMs);
  const end = endMs === undefined ? ANIME_DETAIL_UNKNOWN_LABEL : formatShortDate(endMs);

  return `${start}${ANIME_WATCH_HISTORY_SPAN_SEPARATOR}${end}`;
}

/**
 * Renders one summary date from a pre-log repetition record: a stored
 * timestamp becomes a short date, while a missing record degrades to the
 * shared no-data label (moved from `formatAnimeDetailRepetitionDate`, whose
 * only remaining reader built exactly this summary).
 */
export function formatAnimeWatchSummaryDate(millis: number | undefined): string {
  return millis === undefined ? ANIME_DETAIL_NO_DATA_LABEL : formatShortDate(millis);
}

/**
 * Builds the dashed-summary dates of a pre-log past watch straight from its
 * repetition record; Ended reads `deletedAt` (design Decision b).
 */
function toAnimeWatchSummary(entry: AnimeRepeticion): AnimeWatchSummary {
  return {
    started: formatAnimeWatchSummaryDate(entry.createdAt),
    premiere: formatAnimeWatchSummaryDate(entry.premieredAt),
    lastWatched: formatAnimeWatchSummaryDate(entry.lastWatchedAt),
    ended: formatAnimeWatchSummaryDate(entry.deletedAt),
  };
}

/**
 * Maps one stored repetition to its past watch view model. The caller passes
 * the 1-based watch number assigned after the stable `numRepetitions` sort.
 * A past watch is pre-log when its end is missing or earlier than
 * `logStartMs`; only pre-log watches carry the dashed summary.
 */
function toPastAnimeWatchViewModel(
  entry: AnimeRepeticion,
  number: number,
  totalEpisodes: number | undefined,
  logStartMs: number,
): AnimeWatchViewModel {
  const end = endOfPastWatch(entry);
  const isPreLog = end === undefined || end < logStartMs;
  return {
    key: `watch-${number}`,
    number,
    isCurrent: false,
    isPreLog,
    statusLabel: getAnimeDetailEstadoLabel(entry.status),
    statusColor: getAnimeDetailEstadoColor(entry.status),
    spanLabel: formatWatchSpan(entry.createdAt, end),
    episodesLabel: formatEpisodeCount(entry.episodesWatched),
    progressRatio: formatAnimeDetailProgressRatio(entry.episodesWatched, totalEpisodes),
    summary: isPreLog ? toAnimeWatchSummary(entry) : undefined,
  };
}

/**
 * Builds the per-watch view models of one anime: every stored repetition
 * becomes a past watch numbered after a stable `numRepetitions` ascending
 * sort (design D9, so a shuffled wire order still numbers correctly), and
 * the live watch is always last and current. The live watch starts at the
 * last repeat and ends at `lastWatchedAt`; with no repetitions it spans the
 * anime's own creation date. `logStartMs` is a parameter (rather than the
 * shared constant) so the pre-log boundary stays unit-testable; it defaults
 * to the shared constant for production callers.
 */
export function toAnimeWatchViewModels(detail: AnimeDetail, logStartMs: number = WATCH_HISTORY_LOG_START_MS): readonly AnimeWatchViewModel[] {
  const sorted = (detail.repetitions ?? []).toSorted((a, b) => a.numRepetitions - b.numRepetitions);
  const past = sorted.map((entry, index) =>
    toPastAnimeWatchViewModel(entry, index + 1, detail.totalEpisodes, logStartMs),
  );
  const liveStart = sorted.length === 0 ? detail.createdAt : sorted[sorted.length - 1].repeatedAt ?? detail.createdAt;
  const live: AnimeWatchViewModel = {
    key: `watch-${sorted.length + 1}`,
    number: sorted.length + 1,
    isCurrent: true,
    isPreLog: false,
    statusLabel: getAnimeDetailEstadoLabel(detail.status),
    statusColor: getAnimeDetailEstadoColor(detail.status),
    spanLabel: formatWatchSpan(liveStart, detail.lastWatchedAt),
    episodesLabel:
      detail.totalEpisodes === undefined
        ? formatEpisodeCount(detail.episodesWatched)
        : `${detail.episodesWatched} of ${detail.totalEpisodes} episodes`,
    progressRatio: formatAnimeDetailProgressRatio(detail.episodesWatched, detail.totalEpisodes),
    summary: undefined,
  };
  return [...past, live];
}

/**
 * Builds the Watch history subtitle (e.g. "2 watches · episodes recorded
 * since July 5, 2026"): how many watches the section holds, and the day the
 * episode log began, so a short list never reads as data loss.
 */
export function formatAnimeWatchHistorySubtitle(watchCount: number, logStartMs: number = WATCH_HISTORY_LOG_START_MS): string {
  const watches = watchCount === 1 ? '1 watch' : `${watchCount} watches`;

  return `${watches} · episodes recorded since ${formatDayHeading(logStartMs)}`;
}
