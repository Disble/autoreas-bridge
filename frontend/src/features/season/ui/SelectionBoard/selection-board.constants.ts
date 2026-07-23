import type { ConsiderationOption } from './selection-board.types';

/** Consideration token: no override (mirror of the Go domain enum). */
const CONSIDERATION_NONE = 'none';
/** Consideration token: reject a passing anime for lack of quota. */
export const CONSIDERATION_INSUFFICIENT_QUOTA = 'insufficient_quota';
/** Consideration token: approve a failing anime temporarily. */
export const CONSIDERATION_TEMPORARILY_APPROVED = 'temporarily_approved';
/** Consideration token: approve a failing anime using spare quota. */
export const CONSIDERATION_SPARE_QUOTA = 'spare_quota';

/** The consideration Select options, in Excel-dance order, English labels (ADR-007). */
export const CONSIDERATION_OPTIONS: readonly ConsiderationOption[] = [
  { value: CONSIDERATION_NONE, label: 'None' },
  { value: CONSIDERATION_INSUFFICIENT_QUOTA, label: 'Insufficient quota' },
  { value: CONSIDERATION_TEMPORARILY_APPROVED, label: 'Temporarily approved' },
  { value: CONSIDERATION_SPARE_QUOTA, label: 'Spare quota' },
];

/** Empty-state message when no candidate has been created yet. */
export const SELECTION_EMPTY_MESSAGE = 'No created candidates yet — the selection table fills as animes are created.';

/** Fallback error toast message when confirming the selection fails without a specific status. */
export const SELECTION_CONFIRM_ERROR_MESSAGE = 'Failed to apply reconciliation.';

/** Default minimum approval grade (mirror of the Go domain), used before the snapshot loads. */
export const DEFAULT_MIN_APPROVAL_GRADE = 4;
/** Default slot cap, used before the snapshot loads. */
export const DEFAULT_SLOTS = 12;

/** Lowest grade cutoff. */
export const MIN_GRADE = 1;
/** Highest grade cutoff. */
export const MAX_GRADE = 6;
