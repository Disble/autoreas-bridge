import type { ActivityRequestDetail } from '../../activity-source/activity-incident.types';
import type { ActivityRead } from '../ActivityRunStory/activity-run-story.types';

/** The read of one captured request, keyed by its id. */
export type ActivityRequestRead = ActivityRead<ActivityRequestDetail>;
