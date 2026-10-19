import type { ActivityRecorderEntry } from '../activity-source/activity.types';
import type { ActivityHistoryView, ActivityRecorderPage, ActivityWhere } from './history.types';

/** Request/reply port of the History tab and the 2-hour recorder over the Wails bindings. */
export interface HistorySource {
  /** Reads one History page; the cursor is empty for the first page, which carries the calendar. */
  readonly searchHistory: (where: ActivityWhere, cursor: string, limit: number) => Promise<ActivityHistoryView>;
  /** Reads one recorder page, newest first; the cursor is empty for the first page. */
  readonly listRecorder: (cursor: string, limit: number) => Promise<ActivityRecorderPage>;
  /** Streams every persisted recorder row with a known source; returns the unsubscribe. */
  readonly subscribeRecorder: (listener: (entry: ActivityRecorderEntry) => void) => () => void;
}
