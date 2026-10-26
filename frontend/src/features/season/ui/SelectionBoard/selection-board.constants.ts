import type { ConsiderationOption, SelectionSortOption, Verdict } from './selection-board.types';

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
export const SELECTION_EMPTY_TITLE = 'No candidates to select yet';/** Guidance shown when there are no candidates to select. */
export const SELECTION_EMPTY_DESCRIPTION = 'Rate the created animes in Evaluation; the selection table fills as they are created.';
/** Guidance shown when the criteria hide every candidate; clearing them is the real next step. */
export const SELECTION_FILTERED_EMPTY_DESCRIPTION = 'Grades, verdicts and considerations combine. Widen a group or clear the criteria to see candidates again.';
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

/** The view's sort modes, in Select order. */
export const SELECTION_SORT_OPTIONS: readonly SelectionSortOption[] = [
  { value: 'original', label: 'Current order' },
  { value: 'grade-desc', label: 'Grade: high to low' },
  { value: 'grade-asc', label: 'Grade: low to high' },
  { value: 'name-asc', label: 'Title: A–Z' },
  { value: 'name-desc', label: 'Title: Z–A' },
];

/** The filter trigger's own label; its active-value count is appended by the helper. */
export const SELECTION_FILTERS_LABEL = 'Filters';
/** The heading of the filter popover. */
export const SELECTION_FILTERS_HEADING = 'Filters';
/** The popover action that clears every criterion. */
export const SELECTION_FILTERS_RESET_LABEL = 'Reset filters';
/** The toolbar action that clears the criteria and restores the current order. */
export const SELECTION_VIEW_RESET_LABEL = 'Reset view';
/** Heading shown when the criteria hide every candidate. */
export const SELECTION_FILTERED_EMPTY_TITLE = 'No candidates match these filters';

/** The sentinel tag key that means "this dimension is unrestricted". */
export const SELECTION_FILTER_ALL_KEY = 'all';
/** The label a filter dimension shows while it holds no selected value. */
export const SELECTION_FILTER_ALL_LABEL = 'All';
/** The candidate noun the view counts use; a plural is the noun plus "s". */
export const SELECTION_CANDIDATE_NOUN = 'candidate';
/** Verdict rank keeps Approved before Rejected in every sort mode. */
export const SELECTION_VERDICT_RANK: Readonly<Record<Verdict, number>> = { approved: 0, rejected: 1 };
