import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import type { NotificationEmptyStateConditions } from '../NotificationEmptyState/notification-empty-state.types';
import { isNotificationRowUnread } from '../NotificationTable/notification-table.helpers';
import type { NotificationTableRowKey } from '../NotificationTable/notification-table.types';
import type {
  NotificationCenterPanelEmptyStateInput,
  NotificationCenterQuery,
  NotificationCenterView,
} from './notification-center-panel.types';

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
 * Collapses one of the four view tabs onto the archive/read-state pair the
 * backend query actually understands.
 *
 * Three of the four map cleanly. `read` does not: the store exposes
 * `UnreadOnly` and has no read-only counterpart, so the query it issues is
 * the unfiltered active one and the narrowing happens after the page arrives
 * (`filterNotificationRowsForView`). Asking for `unreadOnly: true` there
 * would return the exact complement of what the tab means.
 */
export function toNotificationCenterQuery(view: NotificationCenterView): NotificationCenterQuery {
  if (view === 'archived') {
    return { view: 'archived', unreadOnly: false };
  }
  return { view: 'active', unreadOnly: view === 'unread' };
}

/**
 * Narrows an already-fetched page to what the selected view means, which is
 * only ever needed for the `read` tab -- see `toNotificationCenterQuery` for
 * why that one cannot be expressed as a query. Every other view is filtered
 * by the backend and is handed its rows back by identity, so the store's own
 * answer stays authoritative and nothing is filtered twice.
 */
export function filterNotificationRowsForView(
  rows: readonly NotificationRow[],
  view: NotificationCenterView,
): readonly NotificationRow[] {
  if (view !== 'read') {
    return rows;
  }
  return rows.filter((row) => !isNotificationRowUnread(row));
}

/** Collects the ids of every loaded record nobody has read yet -- what "Mark all as read" acts on. */
export function toUnreadNotificationIds(rows: readonly NotificationRow[]): number[] {
  return rows.reduce<number[]>((ids, row) => {
    if (isNotificationRowUnread(row)) {
      ids.push(row.id);
    }
    return ids;
  }, []);
}

/**
 * Derives `NotificationEmptyState`'s condition tuple from the sync hook's
 * page-level fields plus whatever is currently narrowing the list.
 *
 * The `read` tab counts as a filter, and the `unread` tab deliberately does
 * not. A filter outranks `unreadOnly` in `selectNotificationEmptyState`'s
 * priority order, so reporting the unread tab as one would hide the
 * "All caught up" rendering behind "No matches" -- while an empty `read` tab
 * genuinely is "nothing matches", never the "All archived" state an
 * unnarrowed empty active view means.
 */
export function toNotificationEmptyStateConditions(
  input: Readonly<NotificationCenterPanelEmptyStateInput>,
): NotificationEmptyStateConditions {
  const query = toNotificationCenterQuery(input.view);
  return {
    totalEverRecorded: input.totalEverRecorded,
    view: query.view,
    unreadOnly: query.unreadOnly,
    hasFilters: input.hasSearch || input.hasFacetFilters || input.view === 'read',
    serviceAvailable: !input.degraded,
  };
}
