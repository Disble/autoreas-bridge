/**
 * Frontend contracts of the Activity read service (`internal/observability/activityread`).
 *
 * They mirror the Go types field for field, renamed to camelCase and made
 * readonly. Optional Go pointers become `number | undefined` and nil slices
 * become empty arrays, so no component ever branches on `null`.
 */

/** Where a recorder row came from. */
export type ActivityRecorderSource = 'request' | 'event';

/**
 * The Go `activityread.RecorderEntry` as the `activity.recorder` event carries
 * it. No bound method returns it, so Wails generates no model for it.
 */
export interface ActivityRecorderPayload {
  /** `request` or `event`; anything else is backend drift. */
  readonly Source: string;
  /** Request id, or the event row id. */
  readonly ID: string;
  /** Capture or occurrence time, epoch milliseconds. */
  readonly AtMS: number;
  /** Capture kind. */
  readonly Kind: string;
  /** Route. */
  readonly Route: string;
  /** HTTP status; null until answered or for events. */
  readonly HTTPStatus: number | null;
  /** Capture outcome. */
  readonly Outcome: string;
  /** Duration in milliseconds; null when not recorded. */
  readonly DurationMS: number | null;
  /** Paired device name. */
  readonly DeviceName: string;
  /** Recorded error code. */
  readonly ErrorCode: string;
  /** Event domain. */
  readonly Domain: string;
  /** Event level. */
  readonly Level: string;
  /** Event type. */
  readonly EventType: string;
  /** Event message. */
  readonly Message: string;
  /** Correlation id. */
  readonly CorrelationID: string;
}

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
