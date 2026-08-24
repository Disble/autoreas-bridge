import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import type { NotificationCenterPanelEmptyStateInput } from './notification-center-panel.types';

/**
 * Derives `NotificationEmptyState`'s condition tuple from the sync hook's
 * page-level fields plus whether a search is currently applied. `hasFilters`
 * mirrors `hasSearch`: Sources/Levels are wired into the store (Slice 3b) but
 * have no UI control yet, so they can never independently narrow a query
 * this panel builds.
 */
export function toNotificationEmptyStateConditions(
  input: Readonly<NotificationCenterPanelEmptyStateInput>,
): NotificationEmptyStateConditions {
  return {
    totalEverRecorded: input.totalEverRecorded,
    view: input.view,
    unreadOnly: input.unreadOnly,
    hasFilters: input.hasSearch,
    serviceAvailable: !input.degraded,
  };
}
