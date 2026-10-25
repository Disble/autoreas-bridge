import { GetActivityIncident, GetActivityRequest, GetActivityRunStory, PinActivityMoment } from '../../../../wailsjs/go/desktop/App';
import { invokeGoBinding } from '../../../infrastructure/wails-bindings.helpers';
import { mapActivityIncidentResult, mapActivityRequestResult, mapActivityRunStory } from './activity-incident.helpers';
import { ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE, ACTIVITY_SOURCE_STATE } from './activity-source.constants';
import type { ActivityRecorderEntry, ActivityRecorderPayload, ActivityRecorderSource } from './activity.types';
import type { ActivitySource } from './activity-source.types';

/**
 * Whether a Go recorder source belongs to the closed union.
 *
 * @param source The `Source` field of a recorder row.
 * @returns True for `request` and `event`.
 */
function isActivityRecorderSource(source: string): source is ActivityRecorderSource {
  return source === 'request' || source === 'event';
}

/** Narrows a Go recorder source onto the closed union, throwing on drift. */
function mapRecorderSource(source: string): ActivityRecorderSource {
  if (isActivityRecorderSource(source)) {
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
    source: mapRecorderSource(entry.Source),
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

/** Rejects a read whose bindings never attached; Activity shows its failure state. */
function rejectRuntimeUnavailable(): never {
  throw new Error(ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE);
}

/**
 * Creates the singleton Activity source over the Wails bindings.
 *
 * @returns The shared source.
 */
export function createActivitySource(): ActivitySource {
  if (ACTIVITY_SOURCE_STATE.sharedSource !== null) {
    return ACTIVITY_SOURCE_STATE.sharedSource;
  }

  const source: ActivitySource = {
    pinMoment() {
      return invokeGoBinding('PinActivityMoment', PinActivityMoment, rejectRuntimeUnavailable);
    },
    getIncident(id) {
      return invokeGoBinding('GetActivityIncident', () => GetActivityIncident(id), rejectRuntimeUnavailable).then(mapActivityIncidentResult);
    },
    getRequest(requestId) {
      return invokeGoBinding('GetActivityRequest', () => GetActivityRequest(requestId), rejectRuntimeUnavailable).then(mapActivityRequestResult);
    },
    getRunStory(correlationId) {
      return invokeGoBinding('GetActivityRunStory', () => GetActivityRunStory(correlationId), rejectRuntimeUnavailable).then(mapActivityRunStory);
    },
  };

  ACTIVITY_SOURCE_STATE.sharedSource = source;
  return source;
}