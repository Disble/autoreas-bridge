/** Readable labels for each intake match status. */
export const MATCH_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pending',
  matched: 'Matched',
  ambiguous: 'Ambiguous',
  not_found: 'Not found',
  discarded: 'Discarded',
};

/** Placeholder for the intake paste textarea. */
export const INTAKE_PASTE_PLACEHOLDER = 'One anime name per line…';
/** Empty-state message when the intake list has no rows yet. */
export const INTAKE_EMPTY_MESSAGE = 'Paste the season intake list to begin.';
