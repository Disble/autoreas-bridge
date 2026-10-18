import type { ActivityNowView, ActivityRecorderEntry } from './activity.types';

/**
 * Request/reply port of the Activity screen over the Wails bindings.
 * Each tab adds the reads it needs when it is built.
 */
export interface ActivitySource {
  /** Reads the Now view; rejects when the bridge database is unavailable. */
  readonly getNow: () => Promise<ActivityNowView>;
  /** Records "Pin this moment"; rejects when the write fails. */
  readonly pinMoment: () => Promise<void>;
  /** Streams every persisted recorder row; returns the unsubscribe. */
  readonly subscribeRecorder: (listener: (entry: ActivityRecorderEntry) => void) => () => void;
}
