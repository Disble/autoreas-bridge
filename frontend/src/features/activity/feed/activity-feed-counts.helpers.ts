import type { Key } from '@heroui/react';
import type { ActivityFeedType, ActivityOverview } from '../feed-source/feed.types';
import { ACTIVITY_FAILURE_TYPES, ACTIVITY_TOGGLE_TYPES, ACTIVITY_TYPE_LABELS } from './activity-feed.constants';
import type { ActivityFailureRowModel, ActivityTypeToggleModel } from './activity-feed.types';

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
 * The failure menu's rows with their failure counts: one per selected
 * section, since the sections filter first and the failure menu narrows them.
 *
 * @param overview The overview read, or undefined while none resolved.
 * @param types The selected sections.
 * @returns One row per selected failure type, menu order.
 */
export function toFailureRows(overview: ActivityOverview | undefined, types: readonly ActivityFeedType[]): readonly ActivityFailureRowModel[] {
  return ACTIVITY_FAILURE_TYPES.filter((type) => types.includes(type)).map((type) => ({ type, label: ACTIVITY_TYPE_LABELS[type], failed: overview === undefined ? 0 : countOf(overview, type).failed }));
}

/**
 * The failures in scope, the number on the failure button.
 *
 * @param overview The overview read, or undefined while none resolved.
 * @param types The selected sections.
 * @returns The failed lines of the selected sections.
 */
export function countFailures(overview: ActivityOverview | undefined, types: readonly ActivityFeedType[]): number {
  return toFailureRows(overview, types).reduce((sum, row) => sum + row.failed, 0);
}

/**
 * The failure menu's selected and disabled keys. A row with no failure is
 * disabled and never shows as selected (design, The menu); `keptDisabled`
 * holds the picked types hidden that way, so a later toggle keeps them.
 *
 * @param rows The menu rows with their counts.
 * @param failureTypes The picked failure types.
 * @returns The selected keys, the disabled keys and the picked disabled types.
 */
export function toFailureMenuKeys(
  rows: readonly ActivityFailureRowModel[],
  failureTypes: readonly ActivityFeedType[],
): { readonly selected: Set<Key>; readonly disabled: Set<Key>; readonly keptDisabled: readonly ActivityFeedType[] } {
  const disabled = new Set<ActivityFeedType>(rows.filter((row) => row.failed === 0).map((row) => row.type));
  const shown = new Set<ActivityFeedType>(rows.map((row) => row.type));
  return {
    selected: new Set<Key>(failureTypes.filter((type) => !disabled.has(type))),
    disabled: new Set<Key>(disabled),
    // a pick hidden by a disabled row or by a section turned off survives the next toggle
    keptDisabled: failureTypes.filter((type) => disabled.has(type) || !shown.has(type)),
  };
}
