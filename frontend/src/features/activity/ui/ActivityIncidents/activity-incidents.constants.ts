import type { ActivityIncidentListEntry } from './activity-incidents.types';

/** Plain words for what fired an incident (`incidents.source_kind`). */
export const ACTIVITY_SOURCE_KIND_WORDS: Readonly<Record<string, string>> = {
  request: 'From a request',
  event: 'Inside the bridge',
  mobile: 'Reported by the phone',
  pin: 'Pinned by you',
};

/** The source kind of an incident fired by an internal runtime event, which opens a run story. */
export const ACTIVITY_INTERNAL_SOURCE_KIND = 'event';

/** The phone report outcome drawn as a failure. */
export const ACTIVITY_PHONE_FAILED_OUTCOME = 'failed';

/** Capture outcomes drawn as a failure even without a 5xx status. */
export const ACTIVITY_FAILED_CAPTURE_OUTCOMES: readonly string[] = ['rejected', 'abandoned'];

/** Lines of a body shown before "Show full body". */
export const ACTIVITY_BODY_PREVIEW_LINES = 8;

/** Characters of a body shown before "Show full body"; a compact JSON body is one long line. */
export const ACTIVITY_BODY_PREVIEW_CHARS = 600;

/** Body state of a stored body cut at the capture limit. */
export const ACTIVITY_BODY_TRUNCATED = 'truncated';

/** Body state of a binary body that was not stored. */
export const ACTIVITY_BODY_OMITTED_BINARY = 'omitted_binary';

/** Screen-reader label of the incident list loading region. */
export const ACTIVITY_INCIDENT_LIST_LOADING_LABEL = 'Loading incidents';

/** Screen-reader label of the incident detail loading region. */
export const ACTIVITY_INCIDENT_DETAIL_LOADING_LABEL = 'Loading the incident';

/** Screen-reader label of the selected request loading region. */
export const ACTIVITY_REQUEST_LOADING_LABEL = 'Loading the request';

/** Failure alert title of the incident list. */
export const ACTIVITY_INCIDENT_LIST_ERROR_TITLE = 'Incidents could not be read';

/** Failure alert title of the incident detail. */
export const ACTIVITY_INCIDENT_DETAIL_ERROR_TITLE = 'This incident could not be read';

/** Failure alert title of the selected request. */
export const ACTIVITY_REQUEST_ERROR_TITLE = 'This request could not be read';

/** Skeleton rows of the incident list. */
export const ACTIVITY_INCIDENT_SKELETON_ROWS = 6;

/** Skeleton rows of the window's request table. */
export const ACTIVITY_REQUEST_SKELETON_ROWS = 4;

/** Shared row geometry of the incident list, used by the rows and their skeleton. */
export const ACTIVITY_INCIDENT_LIST_ROW_CLASS = 'flex min-h-12 min-w-0 items-center gap-2';

/** Shared height of the window lanes, used by the lanes and their skeleton. */
export const ACTIVITY_LANE_ROW_CLASS = 'relative h-6 min-w-0 flex-1';

/** The scroll container of the incident list; it bounds the progressive window. */
export const ACTIVITY_INCIDENT_LIST_SCROLL_CLASS = 'max-h-[70vh] min-h-0 overflow-y-auto';

/** The stable empty list while the incident list is unresolved or failed. */
export const ACTIVITY_NO_LIST_ENTRIES: readonly ActivityIncidentListEntry[] = [];

/** The window lanes, in drawing order. */
export const ACTIVITY_LANE_LABELS: readonly string[] = ['Phone', 'Requests', 'Bridge'];
