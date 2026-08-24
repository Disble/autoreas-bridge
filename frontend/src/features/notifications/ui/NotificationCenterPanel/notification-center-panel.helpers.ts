import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import type { NotificationTableRowKey } from '../NotificationTable/notification-table.types';
import type { NotificationCenterPanelEmptyStateInput } from './notification-center-panel.types';

/**
 * Resolves the row key a pressed master-list row hands back into the numeric
 * record id it addresses. `Table.Row` is given `NotificationRow.id` (already
 * a number), but React Aria widens every key to `string | number`, so the
 * narrowing happens here rather than at a cast. A key that is not a positive
 * whole number addresses no record -- record ids are the store's own
 * autoincrement primary keys -- so it resolves to `null` and the caller
 * opens nothing instead of issuing a `getNotification(NaN)` read.
 */
export function toNotificationRecordId(key: NotificationTableRowKey): number | null {
  const id = Number(key);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

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
