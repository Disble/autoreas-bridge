import { GetActivityIncident, GetActivityRequest, GetActivityRunStory, PinActivityMoment } from '../../../wailsjs/go/desktop/App';
import type { ActivitySource } from '../../shared/contracts/activity.types';
import { callActivityBinding } from './activity-feed-source.helpers';
import { mapActivityIncidentResult, mapActivityRequestResult, mapActivityRunStory } from './activity-incident.helpers';

/**
 * The Wails adapter of the `ActivitySource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every call rejects
 * with the `observability` module's `unavailable` / `failed_precondition`
 * failure rather than answer an empty value.
 *
 * @returns The source.
 */
export function createActivityWailsSource(): ActivitySource {
  return {
    pinMoment: () => callActivityBinding('PinActivityMoment', () => PinActivityMoment()),
    getIncident: (id) => callActivityBinding('GetActivityIncident', () => GetActivityIncident(id)).then(mapActivityIncidentResult),
    getRequest: (requestId) => callActivityBinding('GetActivityRequest', () => GetActivityRequest(requestId)).then(mapActivityRequestResult),
    getRunStory: (correlationId) => callActivityBinding('GetActivityRunStory', () => GetActivityRunStory(correlationId)).then(mapActivityRunStory),
  };
}
