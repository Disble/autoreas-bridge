import type { ActivityLineMark } from '../../shared/contracts/activity-ledger.types';

/** Ledger marks the UI knows how to label; any other mark is dropped at the boundary. */
export const ACTIVITY_KNOWN_LINE_MARKS: readonly ActivityLineMark[] = ['recovered', 'arrived_late', 'incident'];
