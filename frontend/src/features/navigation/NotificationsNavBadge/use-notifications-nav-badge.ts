import type { NotificationCenterSource } from '../../../shared/contracts/notification-center.types';
import { toAsyncView } from '../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_NOTIFICATION_CENTER_SOURCE } from '../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { NOTIFICATIONS_UNREAD_COUNT_KEY } from '../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../shared/query/use-bridge-query/use-bridge-query';

/**
 * Drives the Notifications nav item's unread-count badge: reads
 * `GetUnreadNotificationCount` through `useBridgeQuery` on the `notifications`
 * module. A `notification.push` or `notification.archived` event reads it again
 * (`BRIDGE_INVALIDATIONS`), and the center reads the same key again after its
 * own lifecycle mutations, so reading or archiving a record lowers this badge.
 *
 * Only a loaded count is shown: while the module starts, after it failed, or
 * while the read is pending the badge reports 0, which renders no badge.
 * @param centerSource The notification-center port the count is read through.
 * @returns The unread count to render; 0 renders nothing.
 */
export function useNotificationsNavBadge(centerSource: NotificationCenterSource = BRIDGE_NOTIFICATION_CENTER_SOURCE): number {
  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY,
    queryFn: () => centerSource.getUnreadCount(),
    module: 'notifications',
  });

  // 5. Derived State
  const view = toAsyncView(query);
  return view.kind === 'ready' ? view.data : 0;
}
