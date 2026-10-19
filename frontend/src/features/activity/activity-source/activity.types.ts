/**
 * Frontend contracts of the Activity read service (`internal/observability/activityread`).
 *
 * They mirror the Go types field for field, renamed to camelCase and made
 * readonly. Optional Go pointers become `number | undefined` and nil slices
 * become empty arrays, so no component ever branches on `null`.
 */

/** Which of the three status sentences the Go side chose. */
export type ActivityStatusKind = 'in_sync' | 'quiet' | 'problems';

/** The computed status sentence of the Now view. */
export interface ActivityStatus {
  /** Which wording applies; decides the dot's color. */
  readonly kind: ActivityStatusKind;
  /** The sentence itself, worded by Go. */
  readonly sentence: string;
  /** Minutes since the last phone contact; set for `quiet` only. */
  readonly quietMinutes: number;
  /** Open incidents; set for `problems` only. */
  readonly problems: number;
}

/** One bar of the 24-hour chart. `hasData` false is a gap, never a zero. */
export interface ActivityHourBar {
  /** Start of the hour, epoch milliseconds. */
  readonly hourStartMs: number;
  /** Requests answered in the hour. */
  readonly count: number;
  /** Requests that ended in a 4xx or 5xx. */
  readonly failed: number;
  /** `failed / count`, 0 when the hour holds no request. */
  readonly failedShare: number;
  /** Whether the rollup holds any row for the hour. */
  readonly hasData: boolean;
}

/** One open fingerprint in "Needs a look". */
export interface ActivityIncidentSummary {
  /** Id of the newest stored occurrence, the one the Incidents tab opens. */
  readonly latestId: number;
  /** Stable fingerprint shared by every occurrence. */
  readonly fingerprint: string;
  /** Trigger reason recorded with the incident. */
  readonly reason: string;
  /** Plain-words title worded by Go. */
  readonly title: string;
  /** Time of the newest occurrence, epoch milliseconds. */
  readonly latestAtMs: number;
  /** Time of the first retained occurrence, epoch milliseconds. */
  readonly firstSeenAtMs: number;
  /** Retained occurrences of the fingerprint. */
  readonly occurrences: number;
  /** Whether the fingerprint first appeared recently. */
  readonly isNew: boolean;
  /** Whether the fingerprint comes from an error rather than a slow call. */
  readonly isError: boolean;
}

/** One row of the write journal, with its raw before and after snapshots. */
export interface ActivityChange {
  /** Domain-history row id. */
  readonly id: number;
  /** Bridge time of the write, epoch milliseconds. */
  readonly atMs: number;
  /** Phone time of the write, when the phone reported one. */
  readonly reportedAtMs: number | undefined;
  /** Who wrote it: `mobile`, `desktop`, `system`. */
  readonly source: string;
  /** Domain action, such as `episode_adjusted`. */
  readonly actionType: string;
  /** Anime `_id`. */
  readonly animeId: string;
  /** Anime title, as stored. */
  readonly animeName: string;
  /** Correlation id joining the write to its request, when known. */
  readonly correlationId: string;
  /** Snapshot JSON before the write; empty when the anime was created. */
  readonly beforeJson: string;
  /** Snapshot JSON after the write. */
  readonly afterJson: string;
}

/** The answer to "is everything fine right now?". */
export interface ActivityNowView {
  /** Status sentence and its kind. */
  readonly status: ActivityStatus;
  /** Newest phone request, epoch milliseconds; undefined when none is stored. */
  readonly lastPhoneContactMs: number | undefined;
  /** How long this bridge process has been running. */
  readonly uptimeMs: number;
  /** Requests since local midnight, from the hourly rollup. */
  readonly requestsToday: number;
  /** Open incidents, manual pins excluded. */
  readonly openIncidents: number;
  /** Writes since local midnight. */
  readonly changesToday: number;
  /** The last 24 hours, oldest first, ending with the current hour. */
  readonly hours: readonly ActivityHourBar[];
  /** Open incidents ordered by Go: errors, then new, then newest; at most 3. */
  readonly needsALook: readonly ActivityIncidentSummary[];
  /** The newest writes, newest first; at most 5. */
  readonly recentChanges: readonly ActivityChange[];
}

/** Where a recorder row came from. */
export type ActivityRecorderSource = 'request' | 'event';

/**
 * One live recorder row, request or event, carried by the `activity.recorder`
 * event. A request is emitted twice with the same id; an event row has an empty id.
 */
export interface ActivityRecorderEntry {
  /** Request capture or runtime event. */
  readonly source: ActivityRecorderSource;
  /** Request id, or the event row id; empty for an event without one. */
  readonly id: string;
  /** Capture or occurrence time, epoch milliseconds. */
  readonly atMs: number;
  /** Capture kind (requests only). */
  readonly kind: string;
  /** Route (requests only). */
  readonly route: string;
  /** HTTP status; undefined until answered or for events. */
  readonly httpStatus: number | undefined;
  /** Capture outcome (requests only). */
  readonly outcome: string;
  /** Duration in milliseconds, when recorded. */
  readonly durationMs: number | undefined;
  /** Paired device name (requests only). */
  readonly deviceName: string;
  /** Recorded error code (requests only). */
  readonly errorCode: string;
  /** Event domain (events only). */
  readonly domain: string;
  /** Event level (events only). */
  readonly level: string;
  /** Event type (events only). */
  readonly eventType: string;
  /** Event message (events only). */
  readonly message: string;
  /** Correlation id, when recorded. */
  readonly correlationId: string;
}
