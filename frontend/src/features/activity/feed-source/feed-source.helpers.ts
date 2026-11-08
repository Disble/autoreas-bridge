import { GetActivityChangeContext, GetActivityEvent, GetActivityOverview, GetActivityPhoneReport, SearchActivityFeed } from '../../../../wailsjs/go/desktop/App';
import type { activityread } from '../../../../wailsjs/go/models';
import { invokeGoBinding } from '../../../infrastructure/wails-bindings.helpers';
import { mapActivityChangeContext, mapRunStep } from '../activity-source/activity-incident.helpers';
import { ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE } from '../activity-source/activity-source.constants';
import { mapLedgerLine } from '../history-source/history-source.helpers';
import { FEED_SOURCE_STATE } from './feed-source.constants';
import type { ActivityFeedSource } from './feed-source.types';
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
  ActivityTabletSummary,
  ActivityTrafficHour,
  ActivityTypeCount,
} from './feed.types';

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

/** Rejects a read whose bindings never attached; the screen shows its failure state. */
function rejectRuntimeUnavailable(): Promise<never> {
  return Promise.reject(new Error(ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE));
}

/**
 * Returns the shared feed source over the generated Wails bindings, creating it on first use.
 *
 * @returns The shared ActivityFeedSource.
 */
export function createActivityFeedSource(): ActivityFeedSource {
  if (FEED_SOURCE_STATE.sharedSource !== null) {
    return FEED_SOURCE_STATE.sharedSource;
  }

  const source: ActivityFeedSource = {
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
      return invokeGoBinding('SearchActivityFeed', () => SearchActivityFeed(payload), rejectRuntimeUnavailable).then(mapActivityFeedView);
    },
    getOverview(scale, fromMs, toMs, origin, types, failuresOnly) {
      return invokeGoBinding('GetActivityOverview', () => GetActivityOverview(scale, fromMs, toMs, origin, [...types], failuresOnly), rejectRuntimeUnavailable).then(
        mapActivityOverview,
      );
    },
    getEvent(id) {
      return invokeGoBinding('GetActivityEvent', () => GetActivityEvent(id), rejectRuntimeUnavailable).then((detail) =>
        detail.Found ? mapRunStep(detail.Step) : undefined,
      );
    },
    getChangeContext(changeId, atMs) {
      return invokeGoBinding('GetActivityChangeContext', () => GetActivityChangeContext(changeId, atMs), rejectRuntimeUnavailable).then((context) =>
        context.Found ? mapActivityChangeContext(context) : undefined,
      );
    },
    getPhoneReport(id) {
      return invokeGoBinding('GetActivityPhoneReport', () => GetActivityPhoneReport(id), rejectRuntimeUnavailable).then((detail) => (detail.Found ? detail.PayloadJSON : undefined));
    },
  };

  FEED_SOURCE_STATE.sharedSource = source;
  return source;
}
