import type { NotificationSource } from './notification-source.types';

/** Runtime event name used for frontend notification toasts. */
export const NOTIFICATION_EVENT_NAME = 'notification.push';

/** Module-local singleton container for the shared notification source. */
export const NOTIFICATION_SOURCE_STATE: { sharedSource: NotificationSource | null } = {
  sharedSource: null,
};
