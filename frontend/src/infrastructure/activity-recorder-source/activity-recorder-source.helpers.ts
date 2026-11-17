import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type {
  ActivityRecorderEntry,
  ActivityRecorderOrigin,
  ActivityRecorderPayload,
  ActivityRecorderSource,
} from '../../shared/contracts/activity-recorder.types';
import { createRuntimeSubscription } from '../wails-bindings.helpers';
import { ACTIVITY_RECORDER_EVENT_NAME, ACTIVITY_RECORDER_SOURCE_STATE } from './activity-recorder-source.constants';

/**
 * Whether a Go recorder source belongs to the closed union.
 *
 * @param source The `Source` field of a recorder row.
 * @returns True for `request` and `event`.
 */
function isActivityRecorderOrigin(source: string): source is ActivityRecorderOrigin {
  return source === 'request' || source === 'event';
}

/**
 * Narrows a Go recorder source onto the closed union, throwing on drift.
 *
 * @param source The `Source` field of a recorder row.
 * @returns The recorder origin.
 */
function mapRecorderOrigin(source: string): ActivityRecorderOrigin {
  if (isActivityRecorderOrigin(source)) {
    return source;
  }
  throw new Error(`Unknown activity recorder source: ${source}`);
}

/**
 * Converts one `activity.recorder` payload into the recorder contract.
 *
 * @param entry The recorder payload the event carried.
 * @returns The live recorder row.
 */
export function mapActivityRecorderEntry(entry: ActivityRecorderPayload): ActivityRecorderEntry {
  return {
    source: mapRecorderOrigin(entry.Source),
    id: entry.ID,
    atMs: entry.AtMS,
    kind: entry.Kind,
    route: entry.Route,
    httpStatus: entry.HTTPStatus ?? undefined,
    outcome: entry.Outcome,
    durationMs: entry.DurationMS ?? undefined,
    deviceName: entry.DeviceName,
    errorCode: entry.ErrorCode,
    domain: entry.Domain,
    level: entry.Level,
    eventType: entry.EventType,
    message: entry.Message,
    correlationId: entry.CorrelationID,
  };
}

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
 * The Wails adapter of the `ActivityRecorderSource` port (ADR-032 §4), built
 * once in `shared/query/bridge-runtime/bridge-runtime.constants.ts`: one shared
 * `activity.recorder` runtime listener, attached on the first subscriber and
 * released after the last one leaves.
 *
 * @returns The shared recorder source.
 */
export function createActivityRecorderSource(): ActivityRecorderSource {
  if (ACTIVITY_RECORDER_SOURCE_STATE.sharedSource !== null) {
    return ACTIVITY_RECORDER_SOURCE_STATE.sharedSource;
  }

  const recorderSubscription = createRuntimeSubscription<ActivityRecorderEntry>((emit) => {
    return EventsOn(ACTIVITY_RECORDER_EVENT_NAME, (payload: ActivityRecorderPayload) => {
      const entry = tryMapActivityRecorderEntry(payload);
      if (entry !== undefined) {
        emit(entry);
      }
    });
  });

  const source: ActivityRecorderSource = {
    subscribeRecorder(listener) {
      return recorderSubscription.subscribe(listener);
    },
  };

  ACTIVITY_RECORDER_SOURCE_STATE.sharedSource = source;
  return source;
}
