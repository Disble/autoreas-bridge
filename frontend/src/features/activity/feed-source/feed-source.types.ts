import type { ActivityChangeContext, ActivityRunStep } from '../activity-source/activity-incident.types';
import type { ActivityChartScale, ActivityFeedOrigin, ActivityFeedQuery, ActivityFeedType, ActivityFeedView, ActivityOverview } from './feed.types';

/** Request/reply port of the Activity feed over the Wails bindings. Live rows come from `HistorySource.subscribeRecorder`. */
export interface ActivityFeedSource {
  /** Reads one feed page; rejects when the bridge database is unavailable. */
  readonly searchFeed: (query: ActivityFeedQuery) => Promise<ActivityFeedView>;
  /**
   * Reads the chart of one scale and the per-type counts of a range and origin; a zero bound is the scale's window edge.
   * The bars count the lines of `types` and `failuresOnly` as the feed lists them (no types is every type); the per-type counts ignore both.
   */
  readonly getOverview: (
    scale: ActivityChartScale,
    fromMs: number,
    toMs: number,
    origin: ActivityFeedOrigin,
    types: readonly ActivityFeedType[],
    failuresOnly: boolean,
  ) => Promise<ActivityOverview>;
  /** Reads one runtime event with its metadata by id; undefined when no event has that id. */
  readonly getEvent: (id: number) => Promise<ActivityRunStep | undefined>;
  /** Reads what one change line links to, by its id and time: its anime's runtime events and the captures that carried it, matched by anime and time; undefined when no change has that id. */
  readonly getChangeContext: (changeId: number, atMs: number) => Promise<ActivityChangeContext | undefined>;
}
