import type { ActivityLineMark, ActivityWhere } from '../history-source/history.types';
import type { ActivityHistoryChipModel, ActivityWhereOption } from './activity-history.types';

/** The "where it happened" options, in the order the filter shows them. */
export const ACTIVITY_WHERE_OPTIONS: readonly ActivityWhereOption[] = [
  { id: 'all', label: 'All' },
  { id: 'phone', label: 'Phone and sync' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'editor', label: 'Editor' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'season', label: 'Season' },
];

/** The filter History opens on. */
export const ACTIVITY_DEFAULT_WHERE: ActivityWhere = 'all';

/** Lines per History page. */
export const ACTIVITY_HISTORY_PAGE_LIMIT = 50;

/** The chip each mark draws. */
export const ACTIVITY_MARK_CHIPS: Readonly<Record<ActivityLineMark, ActivityHistoryChipModel>> = {
  arrived_late: { label: 'Arrived late', color: 'warning' },
  recovered: { label: 'Recovered', color: 'warning' },
  incident: { label: 'Incident', color: 'danger' },
};

/** Highest fill level of a calendar square. */
export const ACTIVITY_CALENDAR_MAX_LEVEL = 4;

/** Fill class of each data level; level 0 is a recorded quiet day, still visible on the card surface. */
export const ACTIVITY_CALENDAR_LEVEL_CLASS: readonly string[] = ['bg-muted/30', 'bg-accent/25', 'bg-accent/50', 'bg-accent/75', 'bg-accent'];

/** Squares the skeleton draws: one per calendar day. */
export const ACTIVITY_CALENDAR_DAYS = 90;

/** Geometry shared by a calendar square and its skeleton. */
export const ACTIVITY_CALENDAR_GRID_CLASS = 'grid w-full auto-cols-fr grid-flow-col grid-rows-7 gap-1';

/** One calendar square: a fixed height, stretched to its week column so the calendar spans the card. */
export const ACTIVITY_CALENDAR_CELL_CLASS = 'h-4 w-full rounded-sm';

/** Geometry shared by a History line and its skeleton row. */
export const ACTIVITY_HISTORY_ROW_CLASS = 'flex min-h-11 min-w-0 items-center gap-3 py-1.5';

/** Lines the loading skeleton draws. */
export const ACTIVITY_HISTORY_SKELETON_ROWS = 6;

/** Screen-reader label of the loading status region. */
export const ACTIVITY_HISTORY_LOADING_LABEL = 'Loading History';

/** Note under every gap block: the bridge-off reason is not recorded, so none is given. */
export const ACTIVITY_GAP_NOTE = 'Phone changes from this time may still arrive late.';

/** Local date of a day, `Sun, Oct 18`. */
export const ACTIVITY_DAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Local date without the weekday, `Oct 17`. */
export const ACTIVITY_SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** Local time, `17:31`. */
export const ACTIVITY_LINE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Request counts, `1,912`. */
export const ACTIVITY_HISTORY_COUNT_FORMAT = new Intl.NumberFormat('en-US');

/** A day before recording began: an empty outlined square. */
export const ACTIVITY_CALENDAR_BEFORE_CLASS = 'border border-muted/50';

/** A missing day after recording began: a dashed square, never a quiet fill. */
export const ACTIVITY_CALENDAR_GAP_CLASS = 'border border-dashed border-muted';

/** The red ring of a day with an incident. */
export const ACTIVITY_CALENDAR_INCIDENT_CLASS = 'ring-2 ring-danger';
