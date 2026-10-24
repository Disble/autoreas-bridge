import type { ActivityIncidentDetail } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import type { ActivityRead } from '../ActivityRunStory/activity-run-story.types';
import { toActivityFoundRead } from '../ActivityRunStory/activity-time.helpers';

/**
 * Reads one incident occurrence; gone once it is no longer stored.
 *
 * @param source The Activity port.
 * @param incidentId The occurrence.
 * @returns The ready or gone read; rejects when the read fails.
 */
export function readActivityIncident(source: ActivitySource, incidentId: number): Promise<ActivityRead<ActivityIncidentDetail>> {
  return source.getIncident(incidentId).then(toActivityFoundRead);
}
