import { useEffect } from 'react';
import { createNotificationCenterSource } from '../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../infrastructure/notification-center-source/notification-center-source.types';
import { notificationSource } from '../../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../../infrastructure/notification-source/notification-source.types';
import { useNotificationStore } from '../../../shared/store/notification-store/use-notification-store';
import {
  incrementUnreadNotificationCount,
  setUnreadNotificationCount,
} from '../../../shared/store/notification-store/notification-store.helpers';

/**
 * Drives the Notifications nav item's unread-count badge: seeds the count
 * from `GetUnreadNotificationCount` on mount, then raises it locally
 * whenever a `notification.push` event arrives -- design.md §15's resolved
 * open question ("the subscription is the cheaper answer" over re-polling).
 *
 * The count itself lives in the shared notification store rather than in
 * this hook's state, because arriving pushes are not the only thing that
 * moves it: every notification-center mutation feeds the backend's own
 * fresh `unreadCount` into that store, so reading or archiving a record in
 * the center lowers this badge. Owning the count locally is what previously
 * left the rail reading "2" over a one-row table.
 */
export function useNotificationsNavBadge(
  centerSource: NotificationCenterSource = createNotificationCenterSource(),
  pushSource: NotificationSource = notificationSource,
): number {
  // 3. Context/3rd Party Hooks
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  // 7. Effects
  useEffect(() => {
    void centerSource.getUnreadCount().then(setUnreadNotificationCount);
  }, [centerSource]);

  useEffect(() => {
    return pushSource.subscribe(incrementUnreadNotificationCount);
  }, [pushSource]);

  return unreadCount;
}
