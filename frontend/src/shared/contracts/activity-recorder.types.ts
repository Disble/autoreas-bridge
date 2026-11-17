/**
 * Frontend contracts of the live recorder stream (`activity.recorder`, `app_activity_live.go`).
 *
 * They mirror the Go `activityread.RecorderEntry` field for field, renamed to
 * camelCase and made readonly. Optional Go pointers become `number | undefined`,
 * so no component ever branches on `null`.
 */

/** Where a recorder row came from. */
export type ActivityRecorderOrigin = 'request' | 'event';

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
  readonly source: ActivityRecorderOrigin;
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

/**
 * Port of the live recorder stream (ADR-032 §4): every persisted recorder row,
 * pushed by the `observability` module. The Wails adapter is
 * `createActivityRecorderSource`
 * (`infrastructure/activity-recorder-source/activity-recorder-source.helpers.ts`),
 * exposed once as `BRIDGE_ACTIVITY_RECORDER_SOURCE` in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`.
 */
export interface ActivityRecorderSource {
  /** Streams every persisted recorder row with a known source; returns the unsubscribe. */
  readonly subscribeRecorder: (listener: (entry: ActivityRecorderEntry) => void) => () => void;
}
