/** Initial batch size for the run-history master list. */
export const RUN_HISTORY_PAGE_SIZE = 20;

/** The detail pane's awaiting-selection copy and the real counter labels it previews dimmed. */
export const RUN_HISTORY_DETAIL_AWAITING = {
  title: 'No run selected',
  description: 'Pick a run to see its counters and links.',
  fields: ['Checked', 'Skipped', 'Up to date'],
  sectionLabel: 'Episodes',
} as const;
