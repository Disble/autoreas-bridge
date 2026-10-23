import type { ActivityLedgerLine } from '../history-source/history.types';

/**
 * Frontend contracts of the Activity feed and overview reads
 * (`internal/observability/activityread/feed_types.go`, `overview.go`).
 *
 * They mirror the Go types field for field, renamed to camelCase and made
 * readonly. Nil pointers become `undefined` and nil slices become empty arrays.
 */

/** One type toggle of the feed, the Go `FeedType` values. */
export type ActivityFeedType = 'change' | 'traffic' | 'download' | 'task' | 'edit' | 'bridge';

/** Where a line happened. `all` is a filter value only, never a line's origin. */
export type ActivityFeedOrigin = 'all' | 'phone' | 'bridge';

/** One scale of the time chart, the Go `ChartScale` values. */
export type ActivityChartScale = '24h' | '7d' | '30d' | '90d';

/** One hour of the request rollup, every route and device. */
export interface ActivityTrafficHour {
  /** Start of the hour, epoch milliseconds. */
  readonly hourStartMs: number;
  /** Requests answered in the hour. */
  readonly requests: number;
  /** Requests answered with a 4xx or 5xx status. */
  readonly failed: number;
  /** Slowest request of the hour, milliseconds. */
  readonly maxDurationMs: number;
}

/** One stored download run. */
export interface ActivityDownloadRun {
  /** Run id; it is also the correlation id of the run's events. */
  readonly runId: string;
  /** What started the run, as stored (`manual_anime`, `scheduled`, `season-availability`, or empty). */
  readonly trigger: string;
  /** Run status as stored (`ok`, `error`, `interrupted`, …). */
  readonly status: string;
  /** Start, epoch milliseconds. */
  readonly startedAtMs: number;
  /** End, epoch milliseconds; undefined while the run has not finished. */
  readonly finishedAtMs: number | undefined;
  /** Anime the run checked. */
  readonly animesChecked: number;
  /** Episodes the run found. */
  readonly episodesFound: number;
  /** Episodes the run downloaded. */
  readonly episodesDownloaded: number;
  /** Episodes the run failed to download. */
  readonly episodesFailed: number;
  /** Anime the run skipped. */
  readonly skippedCount: number;
  /** Anime already up to date. */
  readonly upToDateCount: number;
  /** Stored error summary; empty when none. */
  readonly errorSummary: string;
}

/** One feed row. `traffic` and `run` are set only for their own line kind. */
export interface ActivityFeedLine {
  /** The type toggle the line belongs to. */
  readonly type: ActivityFeedType;
  /** Where it happened. */
  readonly origin: Exclude<ActivityFeedOrigin, 'all'>;
  /** Whether the line failed. */
  readonly failed: boolean;
  /** Whether the line was slow or a warning. */
  readonly slow: boolean;
  /** Newest incident occurrence recorded for this fact; undefined when none. */
  readonly incidentId: number | undefined;
  /** The fields every kind has, as History renders them. */
  readonly line: ActivityLedgerLine;
  /** The hour's totals, for a `traffic_hour` line. */
  readonly traffic: ActivityTrafficHour | undefined;
  /** The run, for a `download_run` line. */
  readonly run: ActivityDownloadRun | undefined;
}

/** One local day's feed lines, newest first. */
export interface ActivityFeedDay {
  /** Local midnight of the day, epoch milliseconds. */
  readonly dayStartMs: number;
  /** The day's lines, newest first. */
  readonly lines: readonly ActivityFeedLine[];
}

/** One feed page. */
export interface ActivityFeedView {
  /** Day groups, newest first. */
  readonly days: readonly ActivityFeedDay[];
  /** Cursor of the next older page; empty when none remains. */
  readonly nextCursor: string;
}

/** One feed page request. A zero bound means the edge of the 90-day span; no types means every type. */
export interface ActivityFeedQuery {
  /** Oldest line time, epoch milliseconds, or 0. */
  readonly fromMs: number;
  /** Newest line time, epoch milliseconds, or 0. */
  readonly toMs: number;
  /** Origin filter. */
  readonly origin: ActivityFeedOrigin;
  /** Selected types; bridge lines are read whatever this says unless `failuresOnly`. */
  readonly types: readonly ActivityFeedType[];
  /** Keep only failed lines of `types`. */
  readonly failuresOnly: boolean;
  /** Cursor of the page; empty for the first. */
  readonly cursor: string;
  /** Page size. */
  readonly limit: number;
}

/** One chart bar: the lines whose time falls in [startMs, endMs). */
export interface ActivityChartSlot {
  /** Slot start, epoch milliseconds. */
  readonly startMs: number;
  /** Slot end (exclusive), epoch milliseconds. */
  readonly endMs: number;
  /** Feed lines in the slot. */
  readonly count: number;
  /** Failed feed lines in the slot. */
  readonly failed: number;
}

/** How many lines of one type the range and origin hold. */
export interface ActivityTypeCount {
  /** The type. */
  readonly type: ActivityFeedType;
  /** Lines of the type. */
  readonly lines: number;
  /** Failed lines of the type. */
  readonly failed: number;
}

/** The chart of every origin and the per-type counts of one range and origin. */
export interface ActivityOverview {
  /** Chart slots, oldest first. */
  readonly slots: readonly ActivityChartSlot[];
  /** One count per type, in toolbar order. */
  readonly types: readonly ActivityTypeCount[];
  /** Start of the range the counts read, epoch milliseconds. */
  readonly fromMs: number;
  /** End of the range the counts read, epoch milliseconds. */
  readonly toMs: number;
}
