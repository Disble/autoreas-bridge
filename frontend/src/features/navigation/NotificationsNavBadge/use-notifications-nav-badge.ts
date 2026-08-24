import { useEffect, useState } from 'react';
import { createNotificationCenterSource } from '../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../infrastructure/notification-center-source/notification-center-source.types';
import { notificationSource } from '../../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../../infrastructure/notification-source/notification-source.types';

/**
 * Drives the Notifications nav item's unread-count badge: fetches the
 * current unread count once on mount, then increments it locally whenever a
 * `notification.push` event arrives -- design.md §15's resolved open
 * question ("the subscription is the cheaper answer" over re-polling
 * `GetUnreadNotificationCount`).
 */
export function useNotificationsNavBadge(
  centerSource: NotificationCenterSource = createNotificationCenterSource(),
  pushSource: NotificationSource = notificationSource,
): number {
  // 2. State
  const [unreadCount, setUnreadCount] = useState(0);

  // 7. Effects
  useEffect(() => {
    void centerSource.getUnreadCount().then(setUnreadCount);
  }, [centerSource]);

  useEffect(() => {
    return pushSource.subscribe(() => {
      setUnreadCount((current) => current + 1);
    });
  }, [pushSource]);

  return unreadCount;
}
