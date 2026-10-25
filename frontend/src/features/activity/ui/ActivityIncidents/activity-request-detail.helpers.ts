import type { ActivitySource } from '../../activity-source/activity-source.types';
import { toActivityFoundRead } from '../ActivityRunStory/activity-time.helpers';
import type { ActivityRequestRead } from './activity-incidents.types';

/**
 * Reads one captured request; gone once it is no longer stored.
 *
 * @param source The Activity port.
 * @param requestId The request.
 * @returns The ready or gone read; rejects when the read fails.
 */
export function readActivityRequest(source: ActivitySource, requestId: string): Promise<ActivityRequestRead> {
  return source.getRequest(requestId).then(toActivityFoundRead);
}
