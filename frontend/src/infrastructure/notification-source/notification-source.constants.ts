import type { NotificationSource } from './notification-source.types';

/** Runtime event name used for frontend notification toasts. */
export const NOTIFICATION_EVENT_NAME = 'notification.push';

/**
 * Runtime event name emitted after a notification-center record is
 * archived, carrying the archived record ids (design.md §3 Decision G).
 * Lets a live toast for one of those ids close itself through the shared
 * event bus rather than the toast module importing the notification-center
 * feature directly.
 */
export const NOTIFICATION_ARCHIVED_EVENT_NAME = 'notification.archived';

/**
 * Runtime event name emitted by the `navigation.open` intent, carrying the
 * route frozen into the pressed action's args.
 *
 * That intent runs no backend operation at all — emitting this event IS the
 * whole handler, so an unsubscribed frontend turns every "Open Downloads"
 * press into a successful-looking no-op. It shipped that way once: the Go half
 * was tested, nothing in `src/` named this string, and the app never moved.
 */
export const NOTIFICATION_NAVIGATE_EVENT_NAME = 'notification.navigate';

/** Module-local singleton container for the shared notification source. */
export const NOTIFICATION_SOURCE_STATE: { sharedSource: NotificationSource | null } = {
  sharedSource: null,
};
