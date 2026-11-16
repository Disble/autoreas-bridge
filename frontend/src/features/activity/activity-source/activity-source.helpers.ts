import type { ActivitySource } from '../../../shared/contracts/activity.types';
import { BRIDGE_ACTIVITY_SOURCE } from '../../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { ActivityRecorderEntry, ActivityRecorderPayload, ActivityRecorderSource } from './activity.types';

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

/**
 * The shared Activity source, as `src/app/routes/DownloadsRoute.tsx` hands the
 * run history its run story. Activity's own hooks read `BRIDGE_ACTIVITY_SOURCE`
 * directly; this stays for the downloads consumer until its slice migrates.
 *
 * @returns The shared source.
 */
export function createActivitySource(): ActivitySource {
  return BRIDGE_ACTIVITY_SOURCE;
}
