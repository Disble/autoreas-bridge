import { toast } from '@heroui/react';
import type { Notification } from '../../shared/contracts/notification.types';

function renderToastByLevel(level: Notification['Level']): (message: string, options: { description: string }) => string {
  switch (level) {
    case 'success':
      return toast.success;
    case 'error':
      return toast.danger;
    case 'warning':
      return toast.warning;
    case 'info':
      return toast.info;
  }
}

/**
 * Renders one backend notification with the matching HeroUI toast variant.
 * The bridge keeps this mapping centralized so every feature sees the same
 * success/error/warning/info semantics.
 */
export function renderNotificationToast(notification: Notification): void {
  const renderToast = renderToastByLevel(notification.Level);

  renderToast(notification.Title, { description: notification.Body });
}
