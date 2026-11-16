import type { HistorySource } from './history-source.types';

/** Module-local singleton container for the shared History source. */
export const HISTORY_SOURCE_STATE: { sharedSource: HistorySource | null } = {
  sharedSource: null,
};
