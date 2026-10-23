import type { ActivityChartScale, ActivityFeedType } from '../feed-source/feed.types';

/** Lines per feed page: one batch of the progressive window (ADR-012). */
export const ACTIVITY_FEED_PAGE_LIMIT = 40;

/** Quiet time after the last recorder event before the feed and counts are read again. */
export const ACTIVITY_LIVE_DEBOUNCE_MS = 1000;

/** One hour, milliseconds. */
export const ACTIVITY_HOUR_MS = 3_600_000;

/** Visible name of each type, in toolbar and failure-menu order. */
export const ACTIVITY_TYPE_LABELS: Readonly<Record<ActivityFeedType, string>> = {
  change: 'Changes',
  traffic: 'Traffic',
  download: 'Downloads',
  task: 'Tasks',
  edit: 'Edits',
  bridge: 'Bridge',
};

/** The type toggles of the toolbar. Bridge lines ignore type filters, so Bridge has no toggle. */
export const ACTIVITY_TOGGLE_TYPES: readonly ActivityFeedType[] = ['change', 'traffic', 'download', 'task', 'edit'];

/** Types the feed opens with: Traffic starts off (design, Feed). */
export const ACTIVITY_DEFAULT_TYPES: readonly ActivityFeedType[] = ['change', 'download', 'task', 'edit'];

/** The rows of the failure menu, which the failure filter starts with. */
export const ACTIVITY_FAILURE_TYPES: readonly ActivityFeedType[] = ['change', 'traffic', 'download', 'task', 'edit', 'bridge'];

/** The key of the "All" type toggle. */
export const ACTIVITY_ALL_TYPES_KEY = 'all';

/** The chart scales, in switch order, with their labels. */
export const ACTIVITY_SCALE_OPTIONS: readonly { readonly id: ActivityChartScale; readonly label: string; readonly title: string; readonly end: string }[] = [
  { id: '24h', label: '24 h', title: 'Last 24 hours', end: 'Start of the last 24 hours' },
  { id: '7d', label: '7 days', title: 'Last 7 days', end: 'Start of the last 7 days' },
  { id: '30d', label: '30 days', title: 'Last 30 days', end: 'Start of the last 30 days' },
  { id: '90d', label: '90 days', title: 'Last 90 days', end: 'Start of the last 90 days' },
];

/** Daily slots of each daily scale. */
export const ACTIVITY_SCALE_DAYS: Readonly<Record<Exclude<ActivityChartScale, '24h'>, number>> = { '7d': 7, '30d': 30, '90d': 90 };

/** Daily scales from smallest to largest, for the auto scale of a picked range. */
export const ACTIVITY_DAILY_SCALES: readonly Exclude<ActivityChartScale, '24h'>[] = ['7d', '30d', '90d'];

/** End-of-list mark of a picked range. */
export const ACTIVITY_RANGE_END_MARK = 'Start of this range';

/** Origin of the toolbar's origin switch. */
export const ACTIVITY_ORIGIN_LABELS = { phone: 'Phone', bridge: 'Bridge' } as const;

/** Row subject of a download run, by its stored trigger; an unknown trigger reads as a plain download. */
export const ACTIVITY_RUN_TRIGGER_SUBJECTS: Readonly<Record<string, string>> = {
  manual_anime: 'Manual download',
  scheduled: 'Scheduled download',
  'season-availability': 'Season download',
};

/** Row subject of a download run with no or an unknown trigger. */
export const ACTIVITY_RUN_SUBJECT = 'Download';

/** Row subject of one traffic hour. */
export const ACTIVITY_TRAFFIC_SUBJECT = 'Phone requests';

/** Event type logged once per bridge start, and the subject it reads as (design, S4). */
export const ACTIVITY_BRIDGE_STARTED = { eventType: 'api.listening', subject: 'Bridge started' } as const;

/** Local time, `14:35`. */
export const ACTIVITY_FEED_TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Local date, `Thu, Oct 22`. */
export const ACTIVITY_FEED_DAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Local date and time, `Oct 22, 14:35`. */
export const ACTIVITY_FEED_MOMENT_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Local short date, `Oct 22`. */
export const ACTIVITY_FEED_SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** Local month, `Oct`. */
export const ACTIVITY_FEED_MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short' });

/** Grouped integer, `1,912`. */
export const ACTIVITY_FEED_COUNT_FORMAT = new Intl.NumberFormat('en-US');

/** Rows the loading skeleton draws. */
export const ACTIVITY_FEED_SKELETON_ROWS = 6;

/** Bars the chart skeleton draws. */
export const ACTIVITY_CHART_SKELETON_BARS = 24;

/** Geometry shared by a feed row and its skeleton row. */
export const ACTIVITY_FEED_ROW_CLASS = 'flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-1.5';

/** Height of the chart's bar area, shared by the chart and its skeleton. */
export const ACTIVITY_CHART_BARS_CLASS = 'grid h-24 items-end gap-0.5';

/** Lowest visible fill of a chart slot that holds any line, percent. */
export const ACTIVITY_MIN_BAR_PERCENT = 4;

/** Elements whose clicks keep the drawer open: the drawer itself and the feed rows. */
export const ACTIVITY_DRAWER_KEEP_OPEN_SELECTOR = '[data-activity-drawer], [data-feed-row]';
