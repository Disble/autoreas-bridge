import { useEffect } from 'react';
import { toast } from '@heroui/react';
import { notificationSource } from '../infrastructure/notification-source';
import type { NotificationSource } from '../infrastructure/notification-source';
import type { Notification } from '../shared/contracts/notification.types';

const TOAST_BY_LEVEL: Record<Notification['Level'], (message: string, options: { description: string }) => string> =
  {
    success: toast.success,
    error: toast.danger,
    warning: toast.warning,
    info: toast.info,
  };

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
      const renderToast = TOAST_BY_LEVEL[notification.Level];
      renderToast(notification.Title, { description: notification.Body });
    });

    return unsubscribe;
  }, [source]);

  return;
}
