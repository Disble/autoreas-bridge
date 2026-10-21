import type { ActivityStatusKind } from '../../activity-source/activity.types';

/** Status dot fill per status kind: healthy is quiet green, quiet phone is neutral, problems warn. */
export const ACTIVITY_STATUS_DOT_CLASS: Readonly<Record<ActivityStatusKind, string>> = {
  in_sync: 'bg-success',
  quiet: 'bg-muted',
  problems: 'bg-warning',
};

/** Milliseconds per minute. */
export const ACTIVITY_MINUTE_MS = 60_000;

/** Minutes per hour. */
export const ACTIVITY_MINUTES_PER_HOUR = 60;

/** Hours per day. */
export const ACTIVITY_HOURS_PER_DAY = 24;

/** Thousands-separated counts, `1,912`. */
export const ACTIVITY_COUNT_FORMAT = new Intl.NumberFormat('en-US');

/** The shortest a bar with at least one request is drawn, so a quiet hour never reads as empty. */
export const ACTIVITY_MIN_BAR_PERCENT = 4;

/** How often the Now view is read again while it is open, so the status sentence stays current. */
export const ACTIVITY_NOW_REFRESH_INTERVAL_MS = 15_000;

/** Plain words per write action; an unknown action falls back to its own words. */
export const ACTIVITY_CHANGE_ACTION_WORDS: Readonly<Record<string, string>> = {
  anime_soft_deleted: 'removed',
  anime_restored: 'restored',
  anime_repeated: 'watching again',
  season_grade_set: 'grade changed',
};

/** Plain words per writer; an unknown writer is named as stored. */
export const ACTIVITY_CHANGE_SOURCE_WORDS: Readonly<Record<string, string>> = {
  mobile: 'from the phone',
  desktop: 'from the bridge',
  system: 'by the bridge',
};

/** Screen-reader label of the Now loading region. */
export const ACTIVITY_NOW_LOADING_LABEL = 'Loading activity';

/** Failure alert title (design, "States"). */
export const ACTIVITY_NOW_ERROR_TITLE = 'Activity could not read its history';

/** Failure alert body. */
export const ACTIVITY_NOW_ERROR_DESCRIPTION = 'The rest of the app keeps working.';

/** First-run empty state title. */
export const ACTIVITY_NOW_EMPTY_TITLE = 'Nothing recorded yet';

/** First-run empty state description. */
export const ACTIVITY_NOW_EMPTY_DESCRIPTION = 'Activity fills in once a phone talks to the bridge.';

/** First-run empty state action. */
export const ACTIVITY_NOW_EMPTY_ACTION_LABEL = 'Pair a phone';

/** Route the first-run action opens. */
export const ACTIVITY_PAIRING_ROUTE = '/pairing';

/** Skeleton rows per list, matching the Go caps of "Needs a look" (3) and "Recent changes" (5). */
export const ACTIVITY_NOW_SKELETON_LIST_ROWS = 3;

/** Figures beside the status sentence: requests today, open incidents, changes today. */
export const ACTIVITY_NOW_FIGURE_COUNT = 3;

/** Bars in the 24-hour chart. */
export const ACTIVITY_HOURS_IN_CHART = 24;

/** Shared height of the 24-hour chart, used by the chart and its skeleton. */
export const ACTIVITY_HOUR_CHART_CLASS = 'flex h-24 items-end gap-1';

/** Shared row geometry of the two lists, used by the rows and their skeleton. */
export const ACTIVITY_NOW_LIST_ROW_CLASS = 'flex min-h-10 min-w-0 items-center gap-2';
