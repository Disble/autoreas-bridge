import { ToastProvider } from '@heroui/react';
import { useNotificationToasts } from '../../../../hooks/use-notification-toasts';

/**
 * NotificationToasts mounts the shared HeroUI toast host and subscribes once to
 * the bridge notification stream through the dedicated root hook.
 */
export function NotificationToasts() {
  useNotificationToasts();

  return <ToastProvider placement="top end" />;
}
