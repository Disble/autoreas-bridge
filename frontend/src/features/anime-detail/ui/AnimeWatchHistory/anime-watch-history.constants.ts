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
export const ANIME_WATCH_HISTORY_ROW_CLASS =
  'grid min-h-8 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] bg-white/[0.03] px-3 py-1.5 text-[13px]';

/** Row shape of the All-episodes list, which adds a "Watch K" chip column before the date. */
export const ANIME_WATCH_HISTORY_TAGGED_ROW_CLASS =
  'grid min-h-8 w-full grid-cols-[minmax(0,1fr)_auto_8.75rem] items-center gap-3 rounded-[10px] bg-white/[0.03] px-3 py-1.5 text-[13px]';

/** Hint under a progressively paged list while older pages remain to load. */
export const ANIME_WATCH_HISTORY_SCROLL_HINT = 'More episodes load as you scroll';

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

/** Label of the Started row in a pre-log watch summary. */
export const ANIME_WATCH_SUMMARY_STARTED_LABEL = 'Started';

/** Label of the Premiere row in a pre-log watch summary. */
export const ANIME_WATCH_SUMMARY_PREMIERE_LABEL = 'Premiere';

/** Label of the Last watched row in a pre-log watch summary. */
export const ANIME_WATCH_SUMMARY_LAST_WATCHED_LABEL = 'Last watched';

/** Label of the Ended row in a pre-log watch summary. */
export const ANIME_WATCH_SUMMARY_ENDED_LABEL = 'Ended';

/** Sentence explaining why a pre-log watch lists record dates instead of episodes. */
export const ANIME_WATCH_SUMMARY_EXPLANATION =
  'This watch ended before watch history existed, so there are no episodes to list. Its rewatch record kept these dates.';

/** Test-id stem of a pre-log watch summary; the watch number suffix scopes it per item. */
export const ANIME_WATCH_SUMMARY_TESTID = 'watch-summary';

/** Title shown when a post-log past watch kept no recorded episode rows. */
export const ANIME_WATCH_HISTORY_UNRECORDED_TITLE = 'No recorded episodes';

/** Description shown with the unrecorded title; states the rows are missing, never that nothing was watched. */
export const ANIME_WATCH_HISTORY_UNRECORDED_DESCRIPTION =
  'Episodes from this watch were not recorded. That does not mean none were watched.';
