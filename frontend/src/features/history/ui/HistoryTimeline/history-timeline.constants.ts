/** Accessible label for the global watch-history timeline region. */
export const HISTORY_TIMELINE_LABEL = 'Watch history';

/** Accessible name of the loading status region while the first page is unresolved. */
export const HISTORY_TIMELINE_LOADING_LABEL = 'Loading watch history...';

/**
 * Heading of the alert shown when the watch-history request itself failed.
 * Kept distinct from the empty state so an unavailable binding is never
 * presented as "you have no history" (design D9).
 */
export const HISTORY_TIMELINE_ERROR_TITLE = 'Watch history unavailable';

/** Title of the empty state shown when the first page resolves with zero rows. */
export const HISTORY_TIMELINE_EMPTY_TITLE = 'No watch history yet';

/**
 * Empty-state description stating the log's start date, so a short history
 * never reads as data loss (proposal.md: "History cannot precede 2026-07-05,
 * where the audit log begins").
 */
export const HISTORY_TIMELINE_EMPTY_DESCRIPTION = 'Watch history starts 2026-07-05. Episodes you watch from now on will appear here.';

/** Title of the empty state shown when an active filter narrows the read to zero rows (design D6). */
export const HISTORY_TIMELINE_FILTERED_EMPTY_TITLE = 'No episodes match these filters';

/** Description of the filtered empty state. */
export const HISTORY_TIMELINE_FILTERED_EMPTY_DESCRIPTION = 'Clear or change a filter to see more of your watch history.';

/**
 * Shape shared by the real row `Button` and its loading-skeleton placeholder,
 * so the two cannot drift apart silently (CLAUDE.md FE #14).
 */
export const HISTORY_TIMELINE_ROW_CLASS =
  'grid min-h-9 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[10px] px-2.5 py-2 text-left text-[13px] data-[selected=true]:bg-default data-[selected=true]:ring-1 data-[selected=true]:ring-accent/55 data-[selected=true]:ring-inset';

/** Day section heading: the uppercase weekday and date on the left, the day's episode count on the right. */
export const HISTORY_TIMELINE_DAY_HEADER_CLASS =
  'flex items-center justify-between gap-3 px-2.5 pt-2 pb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase';

/** How many placeholder rows the timeline draws while its first page is unresolved. */
export const HISTORY_TIMELINE_SKELETON_ROW_COUNT = 6;
