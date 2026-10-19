import type { ActivityRecorderStatusColor } from './activity-recorder.types';

/** Most rows the live recorder holds; older rows are read from History. */
export const ACTIVITY_RECORDER_CAP = 500;

/** Rows per recorder page, also the size of each rendered batch. */
export const ACTIVITY_RECORDER_PAGE_LIMIT = 50;

/** Outcome of a request that has not been answered yet. */
export const ACTIVITY_RECORDER_PENDING_OUTCOME = 'pending';

/** Outcome of a request the bridge gave up on at startup. */
export const ACTIVITY_RECORDER_ABANDONED_OUTCOME = 'abandoned';

/** First HTTP status drawn as a client failure. */
export const ACTIVITY_RECORDER_CLIENT_ERROR_STATUS = 400;

/** First HTTP status drawn as a server failure. */
export const ACTIVITY_RECORDER_SERVER_ERROR_STATUS = 500;

/** Chip color of each event level; any other level stays calm. */
export const ACTIVITY_RECORDER_LEVEL_COLOR: Readonly<Record<string, ActivityRecorderStatusColor>> = {
  warn: 'warning',
  error: 'danger',
};

/** Local time with seconds, `17:31:04`. */
export const ACTIVITY_RECORDER_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Screen-reader label of the loading status region. */
export const ACTIVITY_RECORDER_LOADING_LABEL = 'Loading the recorder';

/** Rows the loading skeleton draws. */
export const ACTIVITY_RECORDER_SKELETON_ROWS = 8;

/** Geometry shared by a recorder row and its skeleton row. */
export const ACTIVITY_RECORDER_ROW_CLASS = 'flex min-h-11 min-w-0 items-center gap-3 py-1.5';
