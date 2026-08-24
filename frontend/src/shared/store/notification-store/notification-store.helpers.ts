import type { NotificationMutationResult } from '../../contracts/notification-center.types';
import { notificationStore } from './notification-store.constants';
import type { NotificationStoreState } from './notification-store.types';

/** Reads the current notification store snapshot outside React render. */
export function getNotificationStoreState(): NotificationStoreState {
  return notificationStore.getState();
}

/** Replaces the unread count with the one the backend just reported. */
export function setUnreadNotificationCount(unreadCount: number): void {
  notificationStore.setState({ unreadCount });
}

/**
 * Raises the unread count by one, for a `notification.push` that has just
 * persisted a record nobody has read yet. Counting locally is design.md
 * §15's resolved answer over re-polling `GetUnreadNotificationCount` on
 * every push.
 */
export function incrementUnreadNotificationCount(): void {
  notificationStore.setState((state) => ({ unreadCount: state.unreadCount + 1 }));
}

/**
 * Feeds a lifecycle mutation's own fresh unread count into the store, so the
 * rail badge falls the moment records are read or archived instead of
 * standing at whatever it was seeded with.
 *
 * The count is taken verbatim and never derived from how many records the
 * caller acted on: `Store.Archive` runs a second update carrying
 * `WHERE read_at_ms IS NULL`, so archiving an unread record marks it read as
 * a side effect and local arithmetic would drift.
 *
 * A degraded result is ignored. Its `unreadCount` is the placeholder zero
 * `DEGRADED_NOTIFICATION_MUTATION_RESULT` substitutes when the binding is
 * unavailable, and taking it would clear a badge still standing for records
 * that are genuinely unread.
 */
export function applyNotificationMutationUnreadCount(result: NotificationMutationResult): void {
  if (result.degraded) {
    return;
  }
  setUnreadNotificationCount(result.unreadCount);
}

/** Resets the notification read-model back to its initial state for tests. */
export function resetNotificationStore(): void {
  setUnreadNotificationCount(0);
}
