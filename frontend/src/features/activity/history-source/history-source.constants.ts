import type { ActivityLineMark } from './history.types';
import type { HistorySource } from './history-source.types';

/** Ledger marks the UI knows how to label; any other mark is dropped. */
export const ACTIVITY_KNOWN_LINE_MARKS: readonly ActivityLineMark[] = ['recovered', 'arrived_late', 'incident'];

/** Module-local singleton container for the shared History source. */
export const HISTORY_SOURCE_STATE: { sharedSource: HistorySource | null } = {
  sharedSource: null,
};
