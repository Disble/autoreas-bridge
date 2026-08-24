import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import type { NotificationCenterPanelEmptyStateInput } from './notification-center-panel.types';

/**
 * Derives `NotificationEmptyState`'s condition tuple from the sync hook's
 * page-level fields. `hasFilters` is hardcoded `false`: no search or
 * source/level filters are wired into the panel until Slice 3b adds the
 * filter bar and selection toolbar.
 */
export function toNotificationEmptyStateConditions(
  input: Readonly<NotificationCenterPanelEmptyStateInput>,
): NotificationEmptyStateConditions {
  return {
    totalEverRecorded: input.totalEverRecorded,
    view: input.view,
    unreadOnly: input.unreadOnly,
    hasFilters: false,
    serviceAvailable: !input.degraded,
  };
}
