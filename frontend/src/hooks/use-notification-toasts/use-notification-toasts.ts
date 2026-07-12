import { useEffect } from 'react';
import { notificationSource } from '../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../infrastructure/notification-source/notification-source.types';
import type { Notification } from '../../shared/contracts/notification.types';
import { renderNotificationToast } from './use-notification-toasts.helpers';

/**
 * useNotificationToasts subscribes to the shared `notification.push` runtime
 * stream and renders every incoming notification as a HeroUI toast, mapping
 * `Level` to the matching toast variant (`error` maps to HeroUI's `danger`).
 * This is the ONLY place that owns the toast surface — no feature subscribes
 * to `notification.push` directly.
 */
export function useNotificationToasts(source: NotificationSource = notificationSource): void {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    const unsubscribe = source.subscribe((notification: Notification) => {
      renderNotificationToast(notification);
    });

    return unsubscribe;
  }, [source]);

  return undefined;
}
