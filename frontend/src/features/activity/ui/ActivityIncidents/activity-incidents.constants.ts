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
