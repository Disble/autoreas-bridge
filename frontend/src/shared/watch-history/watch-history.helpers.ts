import type { WatchHistoryEntry } from '../contracts/anime.types';
import {
  DATE_RANGE_SEPARATOR,
  DAY_HEADING_FORMATTER,
  DAY_LIST_HEADING_FORMATTER,
  DAY_LIST_HEADING_YEAR_FORMATTER,
  MONTH_DAY_FORMATTER,
  ROW_DATE_FORMATTER,
  SHORT_DATE_FORMATTER,
} from './watch-history.constants';
import type { HistoryDayGroup } from './watch-history.types';

/** Zero-pads a number to a two-digit string, mirroring history-table.helpers.ts's padTwo. */
function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Maps epoch millis to its local calendar-day key (e.g. "2026-09-12"), the
 * unit `groupEntriesByDay` buckets on (design D5: day grouping is computed
 * client-side, on the local day, never UTC).
 */
export function toLocalDayKey(epochMs: number): string {
  const date = new Date(epochMs);

  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

/**
 * Formats epoch millis as a long-form local day heading (e.g. "September 12,
 * 2026"), derived from the same timestamp family as `formatRowTime` so a
 * heading and its rows never disagree (spec: "History Timestamps Read Well").
 */
export function formatDayHeading(epochMs: number): string {
  return DAY_HEADING_FORMATTER.format(new Date(epochMs));
}

/**
 * Formats epoch millis as a day-list section heading (e.g. "Saturday,
 * September 12"). The year is named only when the day falls outside the year
 * of `nowMs`, so the current year's days stay short without becoming
 * ambiguous across a year boundary.
 */
export function formatDayListHeading(epochMs: number, nowMs: number = Date.now()): string {
  const date = new Date(epochMs);
  const formatter = date.getFullYear() === new Date(nowMs).getFullYear() ? DAY_LIST_HEADING_FORMATTER : DAY_LIST_HEADING_YEAR_FORMATTER;

  return formatter.format(date);
}

/** Reads an episode count as "1 episode" or "N episodes". */
export function formatEpisodeCount(count: number): string {
  return count === 1 ? '1 episode' : `${count} episodes`;
}

/** Formats epoch millis as a short local date (e.g. "Aug 16, 2021"). */
export function formatShortDate(epochMs: number): string {
  return SHORT_DATE_FORMATTER.format(new Date(epochMs));
}

/**
 * Formats a local date range compactly (e.g. "Aug 29 – Sep 11, 2026"): a
 * year shared by both ends is named once at the end, and each end names its
 * own year when they differ.
 */
export function formatCompactDateRange(startMs: number, endMs: number): string {
  const start = new Date(startMs);
  const end = new Date(endMs);

  if (start.getFullYear() !== end.getFullYear()) {
    return `${SHORT_DATE_FORMATTER.format(start)}${DATE_RANGE_SEPARATOR}${SHORT_DATE_FORMATTER.format(end)}`;
  }

  return `${MONTH_DAY_FORMATTER.format(start)}${DATE_RANGE_SEPARATOR}${MONTH_DAY_FORMATTER.format(end)}, ${end.getFullYear()}`;
}

/** Formats epoch millis as a local, zero-padded 24-hour `HH:MM` row time (e.g. "09:05"). */
export function formatRowTime(epochMs: number): string {
  const date = new Date(epochMs);

  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

/**
 * Formats epoch millis as a local date-plus-time episode stamp (e.g. "Fri,
 * Sep 11 · 20:03"), the row timestamp for the Anime Detail episode lists
 * (spec: "All Episodes Lists Every Recorded Episode With Its Watch"). The
 * date half comes from `ROW_DATE_FORMATTER`; the time half reuses the same
 * zero-padded `HH:MM` convention as `formatRowTime` so the two never disagree.
 */
export function formatRowDateTime(epochMs: number): string {
  const date = new Date(epochMs);

  return `${ROW_DATE_FORMATTER.format(date)} · ${formatRowTime(epochMs)}`;
}

/**
 * Formats epoch millis as a weekday-less date-plus-time stamp (e.g. "Sep 12 ·
 * 17:16"), for compact lists such as the History inspector's recent episodes.
 */
export function formatRowShortDateTime(epochMs: number): string {
  return `${MONTH_DAY_FORMATTER.format(new Date(epochMs))} · ${formatRowTime(epochMs)}`;
}

/**
 * Groups strictly-descending-time watch-history rows into day buckets
 * (design D5). Rows arrive already sorted newest-first, so every complete
 * group's count is final; only the trailing (oldest loaded) group is marked
 * `partial` -- its count settles once a row from an older day proves it
 * complete (Anime History spec, "Episode Timeline Is Grouped By Day").
 */
export function groupEntriesByDay(entries: readonly WatchHistoryEntry[], nowMs: number = Date.now()): readonly HistoryDayGroup[] {
  const buckets: { dayKey: string; entries: WatchHistoryEntry[] }[] = [];

  for (const item of entries) {
    const dayKey = toLocalDayKey(item.watchedAtMs);
    const currentBucket = buckets.at(-1);

    if (currentBucket?.dayKey === dayKey) {
      currentBucket.entries.push(item);
    } else {
      buckets.push({ dayKey, entries: [item] });
    }
  }

  return buckets.map((bucket, index) => ({
    dayKey: bucket.dayKey,
    heading: formatDayListHeading(bucket.entries[0].watchedAtMs, nowMs),
    count: bucket.entries.length,
    partial: index === buckets.length - 1,
    entries: bucket.entries,
  }));
}
