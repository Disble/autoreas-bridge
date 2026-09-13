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
 * where `activity_log` begins").
 */
export const HISTORY_TIMELINE_EMPTY_DESCRIPTION = 'Watch history starts 2026-07-05. Episodes you watch from now on will appear here.';

/**
 * Shape shared by the real row `Button` and its loading-skeleton placeholder,
 * so the two cannot drift apart silently (CLAUDE.md FE #14).
 */
export const HISTORY_TIMELINE_ROW_CLASS = 'flex w-full items-center justify-between gap-3 rounded-lg border border-divider/60 bg-content1/60 px-3 py-2 text-left text-sm';

/** How many placeholder rows the timeline draws while its first page is unresolved. */
export const HISTORY_TIMELINE_SKELETON_ROW_COUNT = 6;
