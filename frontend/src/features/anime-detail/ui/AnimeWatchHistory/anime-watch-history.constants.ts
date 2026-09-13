/** Accessible label and visible heading for the per-anime watch-history section (the spec bans separate "Episode history" sections). */
export const ANIME_WATCH_HISTORY_LABEL = 'Watch history';

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

/** Separator joining the start and end halves of a watch span label. */
export const ANIME_WATCH_HISTORY_SPAN_SEPARATOR = ' – ';

/** Tab id selecting the per-watch Accordion; the default tab. */
export const ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID = 'by-watch';

/** Visible label of the per-watch tab. */
export const ANIME_WATCH_HISTORY_BY_WATCH_TAB_LABEL = 'By watch';

/** Tab id selecting the flat newest-first episode list across every cycle. */
export const ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_ID = 'all-episodes';

/** Visible label of the flat-list tab. */
export const ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_LABEL = 'All episodes';

/** Accessible label of the watch-history view tab list. */
export const ANIME_WATCH_HISTORY_TABS_LABEL = 'Watch history views';

/** Text of the chip marking the live (still current) watch in the By-watch Accordion. */
export const ANIME_WATCH_HISTORY_CURRENT_CHIP_LABEL = 'Current';
