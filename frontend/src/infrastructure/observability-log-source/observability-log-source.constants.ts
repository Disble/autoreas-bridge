import type { ObservabilityLogSource } from './observability-log-source.types';

/** Runtime event name for live observability log entries. */
export const OBSERVABILITY_EVENT_NAME = 'observability.log';

/** Module-local singleton container for the shared observability log source. */
export const OBSERVABILITY_LOG_SOURCE_STATE: { sharedSource: ObservabilityLogSource | null } = {
  sharedSource: null,
};
