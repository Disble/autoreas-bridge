import type { ActivityIncidentDetail, ActivityRequestDetail, ActivityRunStory } from './activity-incident.types';

/**
 * Request/reply port of the Activity screen over the Wails bindings.
 * It pins a moment and reads what the detail drawer opens.
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
