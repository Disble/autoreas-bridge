import type { Notification } from './notification.types';

/**
 * Port of the notification push stream (ADR-032 §4): the runtime events the
 * `notifications` module pushes, consumed by the toasts, the center's archived
 * projection and the navigation listener. The Wails adapter is
 * `createNotificationSource`
 * (`infrastructure/notification-source/notification-source.helpers.ts`),
 * exposed once as `BRIDGE_NOTIFICATION_PUSH_SOURCE` in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`.
 */
export interface NotificationPushSource {
  /** Subscribes to the `notification.push` runtime event, invoking `listener` with each pushed notification. */
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
   * this event.
   */
  readonly subscribeNavigate: (listener: (route: string) => void) => () => void;
}
