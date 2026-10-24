import type { ActivityRecorderEntry } from '../activity-source/activity.types';

/** Live port of the Activity screen: the recorder stream over the Wails runtime events. */
export interface HistorySource {
  /** Streams every persisted recorder row with a known source; returns the unsubscribe. */
  readonly subscribeRecorder: (listener: (entry: ActivityRecorderEntry) => void) => () => void;
}
