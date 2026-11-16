import { EventsOn } from '../../../../wailsjs/runtime/runtime';
import { createRuntimeSubscription } from '../../../infrastructure/wails-bindings.helpers';
import { ACTIVITY_RECORDER_EVENT_NAME } from '../activity-source/activity-source.constants';
import { mapActivityRecorderEntry } from '../activity-source/activity-source.helpers';
import type { ActivityRecorderEntry, ActivityRecorderPayload } from '../activity-source/activity.types';
import { HISTORY_SOURCE_STATE } from './history-source.constants';
import type { HistorySource } from './history-source.types';

/**
 * Maps one recorder row, or returns undefined for a source the UI does not
 * know, so backend drift drops one row instead of breaking the live callback.
 *
 * @param entry The recorder payload.
 * @returns The recorder row, or undefined when its source is unknown.
 */
function tryMapActivityRecorderEntry(entry: ActivityRecorderPayload): ActivityRecorderEntry | undefined {
  try {
    return mapActivityRecorderEntry(entry);
  } catch {
    // An unknown source is backend drift: the row is dropped below.
  }
  return undefined;
}

/**
 * Returns the shared History source over the Wails runtime events,
 * creating it on first use.
 *
 * @returns The shared HistorySource.
 */
export function createHistorySource(): HistorySource {
  if (HISTORY_SOURCE_STATE.sharedSource !== null) {
    return HISTORY_SOURCE_STATE.sharedSource;
  }

  const recorderSubscription = createRuntimeSubscription<ActivityRecorderEntry>((emit) => {
    return EventsOn(ACTIVITY_RECORDER_EVENT_NAME, (payload: ActivityRecorderPayload) => {
      const entry = tryMapActivityRecorderEntry(payload);
      if (entry !== undefined) {
        emit(entry);
      }
    });
  });

  const source: HistorySource = {
    subscribeRecorder(listener) {
      return recorderSubscription.subscribe(listener);
    },
  };

  HISTORY_SOURCE_STATE.sharedSource = source;
  return source;
}
