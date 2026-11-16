import { GetActivityChangeContext, GetActivityEvent, GetActivityOverview, GetActivityPhoneReport, SearchActivityFeed } from '../../../wailsjs/go/desktop/App';
import type { activityread } from '../../../wailsjs/go/models';
import type { ActivityLedgerLine, ActivityLineMark } from '../../shared/contracts/activity-ledger.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';
import { ACTIVITY_KNOWN_LINE_MARKS } from './activity-feed-source.constants';
import { mapActivityChangeContext, mapRunStep } from './activity-incident.helpers';
import type { ActivityFeedSource } from '../../shared/contracts/activity.types';
import type {
  ActivityBridgeOffGroup,
  ActivityBridgeStartFacts,
  ActivityChartSlot,
  ActivityDownloadRun,
  ActivityFeedLine,
  ActivityFeedView,
  ActivityOverview,
  ActivityPhoneReportFacts,
  ActivitySyncReading,
  ActivitySystemGroup,
  ActivityTabletSilence,
  ActivityTabletSummary,
  ActivityTrafficHour,
  ActivityTypeCount,
} from '../../shared/contracts/activity-feed.types';

/** Narrows a Go mark onto the known union; undefined for a mark the UI cannot label. */
function toKnownMark(mark: string): ActivityLineMark | undefined {
  return ACTIVITY_KNOWN_LINE_MARKS.find((known) => known === mark);
}

/**
 * Maps one Go ledger line; a nil phone time becomes undefined and unknown marks are dropped.
 *
 * @param line The Go ledger line of a feed line.
 * @returns The ledger line.
 */
export function mapLedgerLine(line: activityread.LedgerLine): ActivityLedgerLine {
  return {
    kind: line.Kind,
    id: line.ID,
    atMs: line.AtMS,
    phoneAtMs: line.PhoneAtMS ?? undefined,
    domain: line.Domain,
    source: line.Source,
    level: line.Level,
    title: line.Title,
    detail: line.Detail,
    correlationId: line.CorrelationID,
    beforeJson: line.BeforeJSON,
    afterJson: line.AfterJSON,
    // Stryker disable next-line ArrayDeclaration: equivalent; a mutant element is not a known mark and is filtered out, so nil still yields [].
    marks: (line.Marks ?? []).map(toKnownMark).filter((mark) => mark !== undefined),
  };
}

/** Maps one Go traffic hour. */
function mapTrafficHour(hour: activityread.TrafficHour): ActivityTrafficHour {
  return { hourStartMs: hour.HourStartMS, requests: hour.Requests, failed: hour.Failed, maxDurationMs: hour.MaxDurationMS };
}

/** Maps one Go download run; a nil end time becomes undefined. */
function mapDownloadRun(run: activityread.DownloadRunLine): ActivityDownloadRun {
  return {
    runId: run.RunID,
    trigger: run.Trigger,
    status: run.Status,
    startedAtMs: run.StartedAtMS,
    finishedAtMs: run.FinishedAtMS ?? undefined,
    animesChecked: run.AnimesChecked,
    episodesFound: run.EpisodesFound,
    episodesDownloaded: run.EpisodesDownloaded,
    episodesFailed: run.EpisodesFailed,
    skippedCount: run.SkippedCount,
    upToDateCount: run.UpToDateCount,
    errorSummary: run.ErrorSummary,
  };
}

/** Maps one Go System group. */
function mapSystemGroup(group: activityread.SystemGroup): ActivitySystemGroup {
  return { hourStartMs: group.HourStartMS, count: group.Count, firstAtMs: group.FirstAtMS, lastAtMs: group.LastAtMS };
}

/** Maps one Go reading; a nil evidence time becomes undefined. */
function mapSyncReading(reading: activityread.SyncReading): ActivitySyncReading {
  const evidence = reading.Evidence;
  return {
    reportId: reading.ReportID,
    reading: reading.Reading as ActivitySyncReading['reading'],
    evidence: {
      failedAtMs: evidence.FailedAtMS,
      arrivedAtMs: evidence.ArrivedAtMS,
      lastContactMs: evidence.LastContactMS ?? undefined,
      nextStartMs: evidence.NextStartMS ?? undefined,
      graceUntilMs: evidence.GraceUntilMS ?? undefined,
      firstReportMs: evidence.FirstReportMS ?? undefined,
      overdueMs: evidence.OverdueMS ?? undefined,
    },
  };
}

/** Maps one Go Bridge off group; nil reports become an empty list. */
function mapBridgeOffGroup(group: activityread.BridgeOffGroup): ActivityBridgeOffGroup {
  return { bridgeStartMs: group.BridgeStartMS, reports: (group.Reports ?? []).map(mapSyncReading) };
}

/** Maps one Go report's stored facts; Go's empty reason means none. */
function mapReportFacts(facts: activityread.PhoneReportFacts): ActivityPhoneReportFacts {
  return { processName: facts.ProcessName, subject: facts.Subject, transition: facts.Transition, reason: facts.Reason === '' ? undefined : facts.Reason, stage: facts.Stage };
}

/** Maps one Go tablet summary, flattened; nil lists become empty and a nil slowest attempt becomes undefined. */
function mapTabletSummary(tablet: activityread.TabletSummary): ActivityTabletSummary {
  const { Summary: summary } = tablet;
  return {
    reportId: tablet.ReportID,
    deviceId: tablet.DeviceID,
    receivedAtMs: tablet.ReceivedAtMS,
    counts: (summary.Counts ?? []).map((count) => ({ triggerSource: count.TriggerSource, outcome: count.Outcome, count: count.Count, maxDurationMs: count.MaxDurationMS ?? undefined })),
    droppedCount: summary.DroppedCount,
    processDeaths: (summary.ProcessDeaths ?? []).map((death) => ({ processName: death.ProcessName, reason: death.Reason, count: death.Count })),
  };
}

/** Maps how the run before a start ended; nil times become undefined. */
function mapBridgeStart(facts: activityread.BridgeStartFacts): ActivityBridgeStartFacts {
  return { closedAtMs: facts.ClosedAtMS ?? undefined, lastEventAtMs: facts.LastEventAtMS ?? undefined };
}

/** Maps one Go tablet silence; nil times and a nil next report become undefined. */
function mapSilence(silence: activityread.TabletSilence): ActivityTabletSilence {
  const report = (stored: activityread.SilenceReport) => ({ kind: stored.Kind, receivedAtMs: stored.ReceivedAtMS, hourStartMs: stored.HourStartMS ?? undefined });
  return {
    deviceId: silence.DeviceID,
    startMs: silence.StartMS,
    endMs: silence.EndMS ?? undefined,
    lastReport: report(silence.LastReport),
    nextReport: mapOptional(silence.NextReport, report),
    bridgeStartedAtMs: silence.BridgeStartedAtMS,
    bridgeStoppedAtMs: silence.BridgeStoppedAtMS ?? undefined,
  };
}

/** Maps a Go value that may be nil; nil becomes undefined. */
function mapOptional<G, F>(value: G | null | undefined, map: (value: G) => F): F | undefined {
  return value ? map(value) : undefined;
}

/** Maps one Go feed line; Go's zero incident id means none. */
function mapFeedLine(line: activityread.FeedLine): ActivityFeedLine {
  return {
    type: line.Type as ActivityFeedLine['type'],
    origin: line.Origin as ActivityFeedLine['origin'],
    failed: line.Failed,
    slow: line.Slow,
    incidentId: line.IncidentID === 0 ? undefined : line.IncidentID,
    line: mapLedgerLine(line.Line),
    traffic: mapOptional(line.Traffic, mapTrafficHour),
    run: mapOptional(line.Run, mapDownloadRun),
    system: mapOptional(line.System, mapSystemGroup),
    syncReading: mapOptional(line.SyncReading, mapSyncReading),
    bridgeOff: mapOptional(line.BridgeOff, mapBridgeOffGroup),
    report: mapOptional(line.Report, mapReportFacts),
    tabletSummaries: (line.TabletSummaries ?? []).map(mapTabletSummary),
    bridgeStart: mapOptional(line.BridgeStart, mapBridgeStart),
    silence: mapOptional(line.Silence, mapSilence),
  };
}

/**
 * Converts one generated Go FeedView into the readonly frontend contract.
 *
 * @param view The payload `SearchActivityFeed` resolved with.
 * @returns The feed page.
 */
export function mapActivityFeedView(view: activityread.FeedView): ActivityFeedView {
  return {
    days: (view.Days ?? []).map((day) => ({ dayStartMs: day.DayStartMS, lines: (day.Lines ?? []).map(mapFeedLine) })),
    nextCursor: view.NextCursor,
  };
}

/** Maps one Go chart slot. */
function mapChartSlot(slot: activityread.ChartSlot): ActivityChartSlot {
  return { startMs: slot.StartMS, endMs: slot.EndMS, count: slot.Count, failed: slot.Failed };
}

/** Maps one Go type count. */
function mapTypeCount(count: activityread.TypeCount): ActivityTypeCount {
  return { type: count.Type as ActivityTypeCount['type'], lines: count.Lines, failed: count.Failed };
}

/**
 * Converts one generated Go OverviewView into the readonly frontend contract.
 *
 * @param view The payload `GetActivityOverview` resolved with.
 * @returns The chart and the per-type counts.
 */
export function mapActivityOverview(view: activityread.OverviewView): ActivityOverview {
  return {
    slots: (view.Slots ?? []).map(mapChartSlot),
    types: (view.Types ?? []).map(mapTypeCount),
  };
}

/**
 * Calls one Activity binding: its rejection becomes a `BridgeError`, and a
 * binding that never attaches rejects as `unavailable` instead of answering a
 * fallback value.
 *
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
export function callActivityBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * The Wails adapter of the `ActivityFeedSource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every call rejects
 * with the `observability` module's `unavailable` / `failed_precondition`
 * failure rather than answer an empty page.
 *
 * @returns The source.
 */
export function createActivityFeedSource(): ActivityFeedSource {
  return {
    searchFeed(query) {
      const payload = {
        FromMS: query.fromMs,
        ToMS: query.toMs,
        Origin: query.origin,
        Types: [...query.types],
        FailuresOnly: query.failuresOnly,
        Cursor: query.cursor,
        Limit: query.limit,
      };
      return callActivityBinding('SearchActivityFeed', () => SearchActivityFeed(payload)).then(mapActivityFeedView);
    },
    getOverview(scale, fromMs, toMs, origin, types, failuresOnly) {
      return callActivityBinding('GetActivityOverview', () => GetActivityOverview(scale, fromMs, toMs, origin, [...types], failuresOnly)).then(mapActivityOverview);
    },
    getEvent(id) {
      return callActivityBinding('GetActivityEvent', () => GetActivityEvent(id)).then((detail) => (detail.Found ? mapRunStep(detail.Step) : undefined));
    },
    getChangeContext(changeId, atMs) {
      return callActivityBinding('GetActivityChangeContext', () => GetActivityChangeContext(changeId, atMs)).then((context) =>
        context.Found ? mapActivityChangeContext(context) : undefined,
      );
    },
    getPhoneReport(id) {
      return callActivityBinding('GetActivityPhoneReport', () => GetActivityPhoneReport(id)).then((detail) => (detail.Found ? detail.PayloadJSON : undefined));
    },
  };
}
