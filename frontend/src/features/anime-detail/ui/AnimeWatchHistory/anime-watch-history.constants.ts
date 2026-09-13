/** Accessible label and visible heading for the per-anime episode-history section. */
export const ANIME_WATCH_HISTORY_LABEL = 'Episode history';

/** Accessible name of the loading status region while the page is unresolved. */
export const ANIME_WATCH_HISTORY_LOADING_LABEL = 'Loading episode history...';

/**
 * Heading of the alert shown when the request itself failed. Kept distinct
 * from the empty state so an unavailable binding is never presented as "this
 * anime has no history" (mirrors HistoryTimeline's design D9 wording).
 */
export const ANIME_WATCH_HISTORY_ERROR_TITLE = 'Episode history unavailable';

/** Title of the empty state shown when the anime has no recorded watch-history rows. */
export const ANIME_WATCH_HISTORY_EMPTY_TITLE = 'No episode history yet';

/** Empty-state description, mirroring HistoryTimeline's log-start-date wording. */
export const ANIME_WATCH_HISTORY_EMPTY_DESCRIPTION = 'Watch history starts 2026-07-05. Episodes you watch from now on will appear here.';

/**
 * Shape shared by the real row and its loading-skeleton placeholder, so the
 * two cannot drift apart silently (CLAUDE.md FE #14).
 */
export const ANIME_WATCH_HISTORY_ROW_CLASS = 'flex w-full items-center justify-between gap-3 rounded-lg border border-divider/60 bg-content1/60 px-3 py-2 text-sm';

/** How many placeholder rows the section draws while its page is unresolved. */
export const ANIME_WATCH_HISTORY_SKELETON_ROW_COUNT = 3;

/**
 * Muted notice shown under the row list when the page's `nextCursor` proves
 * older rows exist beyond this single page (the backend page defaults to its
 * 50-row cap). Points the user to the full global timeline rather than
 * silently truncating a long series or a heavily rewatched one.
 */
export const ANIME_WATCH_HISTORY_TRUNCATED_NOTICE = 'Showing the 50 most recent episodes. The full list is in History.';
