/** Shared long-date formatter hoisted once for day headings (e.g. "September 12, 2026"). */
export const DAY_HEADING_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** Shared date-half formatter for episode rows (e.g. "Fri, Sep 11"); the time half reuses the zero-padded `HH:MM` convention. */
export const ROW_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/**
 * Local-midnight start of the watch-history log (2026-07-05). A past watch
 * ending strictly before this instant predates recording and renders its
 * repetition summary instead of an episode list; a watch ending exactly here
 * is already covered by the log.
 */
export const WATCH_HISTORY_LOG_START_MS = new Date(2026, 6, 5).getTime();

/** Day-list heading formatter for a day in the current year (e.g. "Saturday, September 12"). */
export const DAY_LIST_HEADING_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/** Day-list heading formatter for a day outside the current year (e.g. "Wednesday, December 31, 2025"). */
export const DAY_LIST_HEADING_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/** Short date formatter for compact labels (e.g. "Aug 16, 2021"). */
export const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Month-and-day formatter for compact labels whose year is stated once elsewhere (e.g. "Aug 29"). */
export const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

/** Separator joining the two halves of a compact date range. */
export const DATE_RANGE_SEPARATOR = ' – ';
