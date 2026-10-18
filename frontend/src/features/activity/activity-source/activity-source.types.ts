import type { ActivityIncidentSummary, ActivityNowView, ActivityRecorderEntry } from './activity.types';
import type { ActivityIncidentDetail, ActivityRequestDetail, ActivityRun, ActivityRunStory, ActivityWhere } from './activity-incident.types';

/**
 * Request/reply port of the Activity screen over the Wails bindings.
 * Each tab adds the reads it needs when it is built.
 */
export interface ActivitySource {
  /** Reads the Now view; rejects when the bridge database is unavailable. */
  readonly getNow: () => Promise<ActivityNowView>;
  /** Records "Pin this moment"; rejects when the write fails. */
  readonly pinMoment: () => Promise<void>;
  /** Streams every persisted recorder row; returns the unsubscribe. */
  readonly subscribeRecorder: (listener: (entry: ActivityRecorderEntry) => void) => () => void;
  /** Lists the incidents of the last 7 days for one filter, newest first. */
  readonly listIncidents: (where: ActivityWhere) => Promise<readonly ActivityIncidentSummary[]>;
  /** Reads one incident occurrence by id; undefined when it is no longer stored. */
  readonly getIncident: (id: number) => Promise<ActivityIncidentDetail | undefined>;
  /** Reads one captured request by id with its bodies; undefined when it is no longer stored. */
  readonly getRequest: (requestId: string) => Promise<ActivityRequestDetail | undefined>;
  /** Lists the runs of the last 7 days for one filter, newest first. */
  readonly listRuns: (where: ActivityWhere) => Promise<readonly ActivityRun[]>;
  /** Reads the ordered steps of one correlation id. */
  readonly getRunStory: (correlationId: string) => Promise<ActivityRunStory>;
}
