import { GetActivityNow, PinActivityMoment } from '../../../../wailsjs/go/desktop/App';
import type { activityread } from '../../../../wailsjs/go/models';
import { EventsOn } from '../../../../wailsjs/runtime/runtime';
import { createRuntimeSubscription, invokeGoBinding } from '../../../infrastructure/wails-bindings.helpers';
import {
  ACTIVITY_RECORDER_EVENT_NAME,
  ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE,
  ACTIVITY_SOURCE_STATE,
} from './activity-source.constants';
import type {
  ActivityChange,
  ActivityHourBar,
  ActivityIncidentSummary,
  ActivityNowView,
  ActivityRecorderEntry,
  ActivityRecorderSource,
  ActivityStatusKind,
} from './activity.types';
import type { ActivitySource } from './activity-source.types';

/**
 * Narrows a Go status kind onto the closed union, throwing on an unknown one
 * so backend drift surfaces instead of rendering a wrongly colored dot.
 */
function mapStatusKind(kind: string): ActivityStatusKind {
  switch (kind) {
    case 'in_sync':
    case 'quiet':
    case 'problems':
      return kind;
    default:
      throw new Error(`Unknown activity status kind: ${kind}`);
  }
}

/** Narrows a Go recorder source onto the closed union, throwing on drift. */
function mapRecorderSource(source: string): ActivityRecorderSource {
  switch (source) {
    case 'request':
    case 'event':
      return source;
    default:
      throw new Error(`Unknown activity recorder source: ${source}`);
  }
}

/** Maps one Go hour bar. */
function mapHourBar(bar: activityread.HourBar): ActivityHourBar {
  return {
    hourStartMs: bar.HourStartMS,
    count: bar.Count,
    failed: bar.Failed,
    failedShare: bar.FailedShare,
    hasData: bar.HasData,
  };
}

/** Maps one Go incident summary. */
function mapIncidentSummary(summary: activityread.IncidentSummary): ActivityIncidentSummary {
  return {
    latestId: summary.LatestID,
    fingerprint: summary.Fingerprint,
    reason: summary.Reason,
    title: summary.Title,
    latestAtMs: summary.LatestAtMS,
    firstSeenAtMs: summary.FirstSeenAtMS,
    occurrences: summary.Occurrences,
    isNew: summary.IsNew,
    isError: summary.IsError,
  };
}

/** Maps one Go write-journal row; a nil phone time becomes undefined. */
function mapChange(change: activityread.Change): ActivityChange {
  return {
    id: change.ID,
    atMs: change.AtMS,
    reportedAtMs: change.ReportedAtMS ?? undefined,
    source: change.Source,
    actionType: change.ActionType,
    animeId: change.AnimeID,
    animeName: change.AnimeName,
    correlationId: change.CorrelationID,
    beforeJson: change.BeforeJSON,
    afterJson: change.AfterJSON,
  };
}

/**
 * Converts the generated Go NowView into the readonly frontend contract.
 * Go encodes nil slices and nil pointers as `null`; both become empty values here.
 *
 * @param view The payload `GetActivityNow` resolved with.
 * @returns The Now view the screen renders.
 */
export function mapActivityNowView(view: activityread.NowView): ActivityNowView {
  return {
    status: {
      kind: mapStatusKind(view.Status.Kind),
      sentence: view.Status.Sentence,
      quietMinutes: view.Status.QuietMinutes,
      problems: view.Status.Problems,
    },
    lastPhoneContactMs: view.LastPhoneContactMS ?? undefined,
    uptimeMs: view.UptimeMS,
    requestsToday: view.RequestsToday,
    openIncidents: view.OpenIncidents,
    changesToday: view.ChangesToday,
    hours: (view.Hours ?? []).map(mapHourBar),
    needsALook: (view.NeedsALook ?? []).map(mapIncidentSummary),
    recentChanges: (view.RecentChanges ?? []).map(mapChange),
  };
}

/**
 * Converts one `activity.recorder` payload into the recorder contract.
 *
 * @param entry The Go RecorderEntry the event carried.
 * @returns The live recorder row.
 */
export function mapActivityRecorderEntry(entry: activityread.RecorderEntry): ActivityRecorderEntry {
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

  const recorderSubscription = createRuntimeSubscription<ActivityRecorderEntry>((emit) => {
    return EventsOn(ACTIVITY_RECORDER_EVENT_NAME, (payload: activityread.RecorderEntry) => emit(mapActivityRecorderEntry(payload)));
  });

  const source: ActivitySource = {
    getNow() {
      return invokeGoBinding('GetActivityNow', GetActivityNow, rejectRuntimeUnavailable).then(mapActivityNowView);
    },
    pinMoment() {
      return invokeGoBinding('PinActivityMoment', PinActivityMoment, rejectRuntimeUnavailable);
    },
    subscribeRecorder(listener) {
      return recorderSubscription.subscribe(listener);
    },
  };

  ACTIVITY_SOURCE_STATE.sharedSource = source;
  return source;
}
