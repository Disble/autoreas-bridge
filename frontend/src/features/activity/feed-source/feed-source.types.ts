import type { ActivityChartScale, ActivityFeedOrigin, ActivityFeedQuery, ActivityFeedView, ActivityOverview } from './feed.types';

/** Request/reply port of the Activity feed over the Wails bindings. Live rows come from `HistorySource.subscribeRecorder`. */
export interface ActivityFeedSource {
  /** Reads one feed page; rejects when the bridge database is unavailable. */
  readonly searchFeed: (query: ActivityFeedQuery) => Promise<ActivityFeedView>;
  /** Reads the chart of one scale and the per-type counts of a range and origin; a zero bound is the scale's window edge. */
  readonly getOverview: (scale: ActivityChartScale, fromMs: number, toMs: number, origin: ActivityFeedOrigin) => Promise<ActivityOverview>;
}
