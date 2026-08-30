import type { EventSummarySectionId } from './activity-overview.types';

/** Heading of the captured-request health aggregation. */
export const OVERVIEW_REQUEST_HEALTH_TITLE = 'Request health';

/** Heading of the persisted runtime-event aggregation. */
export const OVERVIEW_EVENT_SUMMARY_TITLE = 'Runtime events';

/** Heading of the bounded newest-events list carried by the event summary. */
export const OVERVIEW_EVENT_SAMPLES_TITLE = 'Newest events';

/**
 * Label for a group whose transport never produced an HTTP status.
 *
 * It is a named state, not a Null Object dash: measured 2026-08-30, 538 of
 * 1,317 stored captures (40.8%) were websocket and none of them carried a
 * status. A dash would read as "unknown" and a 0 would read as a status the
 * bridge returned, and both would misdescribe two fifths of the table.
 */
export const OVERVIEW_NO_STATUS_LABEL = 'No status';

/** Label for a grouping key the store recorded as an empty string. */
export const OVERVIEW_UNLABELLED_KEY_LABEL = '(unlabelled)';

/** Titles of the three independent runtime-event grouping dimensions. */
export const OVERVIEW_EVENT_SECTION_TITLES: Readonly<Record<EventSummarySectionId, string>> = {
  domain: 'By domain',
  level: 'By level',
  eventType: 'By event type',
};

/**
 * Copy shown when the captured-request reader itself could not be read.
 *
 * Kept distinct from the empty copy for the same reason the Go contract keeps
 * Degraded apart from an empty result: zero groups from a broken read is not
 * the same fact as zero groups from a healthy one.
 */
export const OVERVIEW_REQUESTS_DEGRADED_MESSAGE =
  'The captured-request store could not be read, so these counts are not a measured result.';

/** Sub-heading of the persisted runtime-event aggregation on a healthy read. */
export const OVERVIEW_EVENT_SUMMARY_DESCRIPTION = 'Counts by domain, level and event type over the persisted store';

/**
 * Sub-heading used in place of a count line when the underlying read failed.
 * A card header that still says "0 captured requests" under a broken read is
 * itself a zero presented as a measurement.
 */
export const OVERVIEW_UNMEASURED_DESCRIPTION = 'Counts unavailable — see the reason below';

/** Copy shown when the request aggregation is healthy and matched nothing. */
export const OVERVIEW_REQUESTS_EMPTY_MESSAGE = 'No captured requests match the current filters.';

/** Copy shown when the event aggregation is healthy and matched nothing. */
export const OVERVIEW_EVENTS_EMPTY_MESSAGE = 'No persisted runtime events have been recorded yet.';

/** Copy shown while the two aggregations have not resolved. */
export const OVERVIEW_LOADING_MESSAGE = 'Loading the activity summary…';

/**
 * Standing note that the overview covers six of the MCP's seven read tools.
 *
 * `get_correlation_timeline` has no desktop equivalent by construction: the two
 * stores are keyed on different values, so a merged request+event timeline
 * would render an empty request side. Stating it here keeps the gap an explicit
 * exclusion rather than something a reader has to notice.
 */
export const OVERVIEW_PARITY_NOTE =
  'Captured requests and runtime events are summarized separately: they are keyed on different values, so there is no merged correlation timeline.';
