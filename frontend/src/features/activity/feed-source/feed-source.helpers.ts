import { GetActivityChangeContext, GetActivityEvent, GetActivityOverview, SearchActivityFeed } from '../../../../wailsjs/go/desktop/App';
import type { activityread } from '../../../../wailsjs/go/models';
import { invokeGoBinding } from '../../../infrastructure/wails-bindings.helpers';
import { mapActivityChangeContext, mapRunStep } from '../activity-source/activity-incident.helpers';
import { ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE } from '../activity-source/activity-source.constants';
import { mapLedgerLine } from '../history-source/history-source.helpers';
import { FEED_SOURCE_STATE } from './feed-source.constants';
import type { ActivityFeedSource } from './feed-source.types';
import type { ActivityChartSlot, ActivityDownloadRun, ActivityFeedLine, ActivityFeedView, ActivityOverview, ActivityTrafficHour, ActivityTypeCount } from './feed.types';

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

/** Maps one Go feed line; Go's zero incident id means none. */
function mapFeedLine(line: activityread.FeedLine): ActivityFeedLine {
  return {
    type: line.Type as ActivityFeedLine['type'],
    origin: line.Origin as ActivityFeedLine['origin'],
    failed: line.Failed,
    slow: line.Slow,
    incidentId: line.IncidentID === 0 ? undefined : line.IncidentID,
    line: mapLedgerLine(line.Line),
    traffic: line.Traffic ? mapTrafficHour(line.Traffic) : undefined,
    run: line.Run ? mapDownloadRun(line.Run) : undefined,
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
    getOverview(scale, fromMs, toMs, origin) {
      return invokeGoBinding('GetActivityOverview', () => GetActivityOverview(scale, fromMs, toMs, origin), rejectRuntimeUnavailable).then(mapActivityOverview);
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
  };

  FEED_SOURCE_STATE.sharedSource = source;
  return source;
}
