import type { ConsiderationOption, Verdict } from './selection-board.types';

/** The candidate list's groups, in display order: approved first, rejected after. */
export const SELECTION_GROUP_VERDICTS: readonly Verdict[] = ['approved', 'rejected'];

/** Consideration token: no override (mirror of the Go domain enum). */
export const CONSIDERATION_NONE = 'none';
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

/** Heading shown when there are no candidates to select. */
export const SELECTION_EMPTY_TITLE = 'No candidates to select yet';
/** Guidance shown when there are no candidates to select. */
export const SELECTION_EMPTY_DESCRIPTION = 'Rate the created animes in Evaluation; the selection table fills as they are created.';
/** Recovery action label shown when there are no candidates to select. */
export const SELECTION_EMPTY_ACTION_LABEL = 'Go to Evaluation';

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
