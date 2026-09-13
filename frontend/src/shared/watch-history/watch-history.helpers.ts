import type { WatchHistoryEntry } from '../contracts/anime.types';
import { DAY_HEADING_FORMATTER } from './watch-history.constants';
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

/** Formats epoch millis as a local, zero-padded 24-hour `HH:MM` row time (e.g. "09:05"). */
export function formatRowTime(epochMs: number): string {
  const date = new Date(epochMs);

  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

/**
 * Groups strictly-descending-time watch-history rows into day buckets
 * (design D5). Rows arrive already sorted newest-first, so every complete
 * group's count is final; only the trailing (oldest loaded) group is marked
 * `partial` -- its count settles once a row from an older day proves it
 * complete (Anime History spec, "Episode Timeline Is Grouped By Day").
 */
export function groupEntriesByDay(entries: readonly WatchHistoryEntry[]): readonly HistoryDayGroup[] {
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
    heading: formatDayHeading(bucket.entries[0].watchedAtMs),
    count: bucket.entries.length,
    partial: index === buckets.length - 1,
    entries: bucket.entries,
  }));
}
