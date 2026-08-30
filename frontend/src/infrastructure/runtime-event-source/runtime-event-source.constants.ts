import type { RuntimeEventSource } from './runtime-event-source.types';

/**
 * Degraded page returned when the Wails bindings are unavailable. `available`
 * stays false and `degraded` true so the surface reports that it could not
 * read the store, rather than presenting an empty successful result.
 */
export const DEGRADED_EMPTY_RUNTIME_EVENT_PAGE = {
  items: [],
  appliedLimit: 0,
  malformedRowsSkipped: 0,
  warningCount: 0,
  available: false,
  degraded: true,
} as const;

/** Degraded aggregation returned when the Wails bindings are unavailable. */
export const DEGRADED_RUNTIME_EVENT_SUMMARY = {
  byDomain: [],
  byLevel: [],
  byEventType: [],
  samples: [],
  available: false,
  degraded: true,
} as const;

/** Module-local singleton container for the shared runtime-event source. */
export const RUNTIME_EVENT_SOURCE_STATE: { sharedSource: RuntimeEventSource | null } = {
  sharedSource: null,
};
