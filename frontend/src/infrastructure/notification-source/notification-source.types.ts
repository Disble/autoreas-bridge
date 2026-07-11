import type { Notification } from '../../shared/contracts/notification.types';

/**
 * Push-only notification stream consumed by the app-shell toast hook.
 */
export interface NotificationSource {
  readonly subscribe: (listener: (notification: Notification) => void) => () => void;
}
