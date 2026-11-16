import type { ActivityChartScale, ActivityFeedOrigin, ActivityFeedQuery, ActivityFeedType, ActivityFeedView, ActivityOverview } from './activity-feed.types';
import type { ActivityChangeContext, ActivityIncidentDetail, ActivityRequestDetail, ActivityRunStep, ActivityRunStory } from './activity-incident.types';

/**
 * Port of the Activity screen's reads and its pin (ADR-032 §4), all served by
 * the backend `observability` module. The Wails adapter is
 * `createActivityWailsSource` (`infrastructure/bridge-runtime-source/activity-source.helpers.ts`),
 * built once in `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every
 * method rejects with a `BridgeError` rather than answer an empty value:
 * `unavailable` while the module starts, `failed_precondition` once it failed.
 */
export interface ActivitySource {
  /** Records "Pin this moment"; rejects when the write fails. */
  readonly pinMoment: () => Promise<void>;
  /** Reads one incident occurrence by id; undefined when it is no longer stored. */
  readonly getIncident: (id: number) => Promise<ActivityIncidentDetail | undefined>;
  /** Reads one captured request by id with its bodies; undefined when it is no longer stored. */
  readonly getRequest: (requestId: string) => Promise<ActivityRequestDetail | undefined>;
  /** Reads the ordered steps of one correlation id. */
  readonly getRunStory: (correlationId: string) => Promise<ActivityRunStory>;
}

/**
 * Port of the Activity feed's reads (ADR-032 §4), served by the backend
 * `observability` module like `ActivitySource`; the Wails adapter is
 * `createActivityFeedSource` (`infrastructure/bridge-runtime-source/activity-feed-source.helpers.ts`).
 * Live rows come from `HistorySource.subscribeRecorder`.
 */
export interface ActivityFeedSource {
  /** Reads one feed page. */
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
  /** Reads the stored payload of one phone report by id: the validated record re-serialized, not mobile's raw bytes; undefined when no report has that id. */
  readonly getPhoneReport: (id: number) => Promise<string | undefined>;
}
