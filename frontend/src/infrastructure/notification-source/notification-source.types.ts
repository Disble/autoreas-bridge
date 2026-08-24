import type { Notification } from '../../shared/contracts/notification.types';

/**
 * Push-only notification stream consumed by the app-shell toast hook.
 */
export interface NotificationSource {
  readonly subscribe: (listener: (notification: Notification) => void) => () => void;
  /**
   * Subscribes to the `notification.archived` runtime event, invoking
   * `listener` with the archived record ids (design.md §3 Decision G).
   */
  readonly subscribeArchived: (listener: (recordIds: readonly number[]) => void) => () => void;
}
