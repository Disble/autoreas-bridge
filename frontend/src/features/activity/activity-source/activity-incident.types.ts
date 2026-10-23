/**
 * Frontend contracts of the Incidents tab and the run story: the incident
 * detail, the folded request window, one captured request, and runs.
 *
 * Like `activity.types.ts`, they mirror the Go types of `activityread` field
 * for field in camelCase; nil pointers become `undefined` and nil slices
 * become empty arrays.
 */

/** The "where it happened" filter (`activityread.Where`). */
export type ActivityWhere = 'all' | 'phone' | 'downloads' | 'editor' | 'schedule' | 'season';

/** One stored incident occurrence with its plain-words title. */
export interface ActivityIncidentOccurrence {
  /** Occurrence id, the primary key the detail is read by. */
  readonly id: number;
  /** Stable fingerprint shared by every occurrence. */
  readonly fingerprint: string;
  /** Trigger reason, such as `http_5xx`. */
  readonly reason: string;
  /** Plain-words title worded by Go. */
  readonly title: string;
  /** When the triggering fact happened, epoch milliseconds. */
  readonly occurredAtMs: number;
  /** Start of the pinned window, epoch milliseconds. */
  readonly windowStartMs: number;
  /** End of the pinned window, epoch milliseconds. */
  readonly windowEndMs: number;
  /** Which recorder fact fired it: `request`, `event`, `mobile` or `pin`. */
  readonly sourceKind: string;
  /** Id of that fact: a request id, an event row id, a phone event id or a pin id. */
  readonly sourceId: string;
}

/** The recorded cause of the triggering fact. */
export interface ActivityCause {
  /** False when the fact recorded no cause or is no longer stored. */
  readonly known: boolean;
  /** Recorded error code, when one exists. */
  readonly errorCode: string;
  /** Recorded error text. */
  readonly message: string;
}

/** One row of the window's request table: requests sharing a route template and a status. */
export interface ActivityFoldedRequest {
  /** Route template, `/api/animes/:id`. */
  readonly routeTemplate: string;
  /** HTTP status; undefined when the request was never answered. */
  readonly httpStatus: number | undefined;
  /** Requests folded into the row. */
  readonly count: number;
  /** First request of the row, epoch milliseconds. */
  readonly firstAtMs: number;
  /** Last request of the row, epoch milliseconds. */
  readonly lastAtMs: number;
  /** Id of the row's latest request, the one its detail opens. */
  readonly latestRequestId: string;
  /** Capture kind of the latest request. */
  readonly kind: string;
  /** Capture outcome of the latest request. */
  readonly outcome: string;
  /** Slowest request of the row in milliseconds, when recorded. */
  readonly maxDurationMs: number | undefined;
  /** Whether the triggering request is one of the row's requests. */
  readonly containsTrigger: boolean;
}

/** One runtime event without its metadata. */
export interface ActivityEventSummary {
  /** Event row id. */
  readonly id: number;
  /** Occurrence time, epoch milliseconds. */
  readonly atMs: number;
  /** Event domain, such as `download`. */
  readonly domain: string;
  /** Logger level: `debug`, `info`, `warn` or `error`. */
  readonly level: string;
  /** Event type, such as `download.failed`. */
  readonly eventType: string;
  /** Event message. */
  readonly message: string;
  /** Correlation id joining the event to its run, when recorded. */
  readonly correlationId: string;
}

/** One stored phone report. */
export interface ActivityPhoneReport {
  /** Report row id. */
  readonly id: number;
  /** When the bridge received it, epoch milliseconds. */
  readonly atMs: number;
  /** The phone's own observation time, when the report carried one. */
  readonly phoneAtMs: number | undefined;
  /** Reporting device. */
  readonly deviceId: string;
  /** Report kind. */
  readonly kind: string;
  /** Reported outcome, empty when none was reported. */
  readonly outcome: string;
}

/** Another retained occurrence of the same fingerprint. */
export interface ActivityEarlierOccurrence {
  /** Occurrence id. */
  readonly id: number;
  /** When it happened, epoch milliseconds. */
  readonly occurredAtMs: number;
}

/** The answer to "what went wrong, and why?" for one occurrence. */
export interface ActivityIncidentDetail {
  /** The occurrence itself. */
  readonly incident: ActivityIncidentOccurrence;
  /** The recorded cause of its triggering fact. */
  readonly cause: ActivityCause;
  /** The window's requests, folded by route template and status, in order of first appearance. */
  readonly requests: readonly ActivityFoldedRequest[];
  /** The window's runtime events, oldest first. */
  readonly events: readonly ActivityEventSummary[];
  /** The window's phone reports, oldest first. */
  readonly phoneReports: readonly ActivityPhoneReport[];
  /** Earlier retained occurrences, newest first. */
  readonly earlier: readonly ActivityEarlierOccurrence[];
  /** When this occurrence ages out, epoch milliseconds. */
  readonly expiresAtMs: number;
}

/** One captured request with its bodies, read by id. */
export interface ActivityRequestDetail {
  /** Bridge request id. */
  readonly requestId: string;
  /** Capture time, epoch milliseconds. */
  readonly capturedAtMs: number;
  /** Capture kind. */
  readonly kind: string;
  /** Concrete route. */
  readonly route: string;
  /** Transport, such as `http` or `ws`. */
  readonly transport: string;
  /** Capture outcome. */
  readonly outcome: string;
  /** Recorded error code, empty when none. */
  readonly errorCode: string;
  /** HTTP status, when answered. */
  readonly httpStatus: number | undefined;
  /** Duration in milliseconds, when recorded. */
  readonly durationMs: number | undefined;
  /** Request body as stored; undefined when none was captured. */
  readonly requestBody: string | undefined;
  /** Request body state: empty, `truncated` or `omitted_binary`. */
  readonly requestBodyState: string;
  /** Response body as stored; undefined when none was captured. */
  readonly responseBody: string | undefined;
  /** Response body state: empty, `truncated` or `omitted_binary`. */
  readonly responseBodyState: string;
  /** Paired device name. */
  readonly deviceName: string;
}

/** The events sharing one correlation id; the outcome is their worst level. */
export interface ActivityRun {
  /** The run's correlation id. */
  readonly correlationId: string;
  /** First event, epoch milliseconds. */
  readonly firstAtMs: number;
  /** Last event, epoch milliseconds. */
  readonly lastAtMs: number;
  /** Events in the run. */
  readonly steps: number;
  /** Worst level among them: `debug`, `info`, `warn` or `error`. */
  readonly outcome: string;
  /** Type of the run's first event. */
  readonly firstEventType: string;
  /** Message of the run's first event. */
  readonly firstMessage: string;
}

/** One event of a run story, with its raw metadata. */
export interface ActivityRunStep extends ActivityEventSummary {
  /** Recorded duration in milliseconds, when any. */
  readonly durationMs: number | undefined;
  /** Raw metadata JSON; empty when none was recorded. */
  readonly metadataJson: string;
}

/** The ordered steps of one correlation id. */
export interface ActivityRunStory {
  /** The run's correlation id. */
  readonly correlationId: string;
  /** Its events, oldest first. */
  readonly steps: readonly ActivityRunStep[];
  /** True when Go capped the steps. */
  readonly truncated: boolean;
}
