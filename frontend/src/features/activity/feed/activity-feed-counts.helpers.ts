import type { ActivityFeedType, ActivityOverview } from '../feed-source/feed.types';
import { ACTIVITY_TOGGLE_TYPES, ACTIVITY_TYPE_LABELS } from './activity-feed.constants';
import type { ActivityTypeToggleModel } from './activity-feed.types';

/** The overview's count of one type; zero when the overview omits it. */
function countOf(overview: ActivityOverview, type: ActivityFeedType): { readonly lines: number; readonly failed: number } {
  return overview.types.find((count) => count.type === type) ?? { lines: 0, failed: 0 };
}

/**
 * The type toggles with the counts of the current range and origin.
 *
 * @param overview The overview read, or undefined while none resolved.
 * @returns One toggle per type, toolbar order; counts are unknown without an overview.
 */
export function toTypeToggles(overview: ActivityOverview | undefined): readonly ActivityTypeToggleModel[] {
  return ACTIVITY_TOGGLE_TYPES.map((type) => {
    const count = overview === undefined ? undefined : countOf(overview, type);
    return { type, label: ACTIVITY_TYPE_LABELS[type], lines: count?.lines, failed: count?.failed ?? 0 };
  });
}

/**
 * The failures in scope, the number on the failure switch.
 *
 * @param overview The overview read, or undefined while none resolved.
 * @param types The selected sections.
 * @returns The failed lines of the selected sections.
 */
export function countFailures(overview: ActivityOverview | undefined, types: readonly ActivityFeedType[]): number {
  return overview === undefined ? 0 : types.reduce((sum, type) => sum + countOf(overview, type).failed, 0);
}
