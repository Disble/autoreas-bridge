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
  /**
   * Subscribes to the `notification.navigate` runtime event, invoking
   * `listener` with the route a pressed `navigation.open` token froze.
   *
   * The backend intent has no other channel to the frontend: it runs no
   * operation of its own and hands the press to the delivery layer through
   * this event. Nothing subscribed to it until this member existed, so every
   * "Open Downloads" press emitted into the void and reported success.
   */
  readonly subscribeNavigate: (listener: (route: string) => void) => () => void;
}
