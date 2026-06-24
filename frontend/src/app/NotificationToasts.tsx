import { ToastProvider } from '@heroui/react';
import { useNotificationToasts } from '../hooks/use-notification-toasts';

/**
 * NotificationToasts is the dedicated app-shell surface for the
 * `notification.push` toast stream. It mounts HeroUI's `ToastProvider` and
 * subscribes once via `useNotificationToasts`, keeping `AppLayout.tsx` itself
 * hook-free. No feature owns this surface — see "Toasts Are Not Owned by the
 * Download Feature" in specs/download-ui/spec.md.
 */
export function NotificationToasts() {
  useNotificationToasts();

  return <ToastProvider placement="top end" />;
}
