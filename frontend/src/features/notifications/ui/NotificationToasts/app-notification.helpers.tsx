import { toast } from '@heroui/react';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import type { ToastOptions } from './app-notification.types';

/**
 * Renders an AppNotification as a HeroUI toast using the positional
 * `toast.warning(message, options)` / `toast.danger(...)` API.
 * Returns the toast id so the controller can track it for deduplication.
 */
export function renderAppNotificationToast(notification: AppNotification): string {
  const { severity, title, description, actions, persistent } = notification;

  const options: Omit<ToastOptions, 'variant'> = {};
  if (description) {
    options.description = description;
  }
  if (actions?.length) {
    options.actionProps = {
      children: actions[0].label,
      onPress: actions[0].onPress,
    };
  }
  if (persistent) {
    options.timeout = 0;
  }

  switch (severity) {
    case 'success':
      return toast.success(title, options);
    case 'warning':
      return toast.warning(title, options);
    case 'error':
      return toast.danger(title, options);
    default:
      return toast.info(title, options);
  }
}
