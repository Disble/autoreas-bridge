import type { NotificationActionResult } from '../../shared/contracts/notification-center.types';
import type { NotificationCenterSource } from './notification-center-source.types';

/** Degraded-empty page returned when the Wails bindings are unavailable. */
export const DEGRADED_EMPTY_NOTIFICATION_PAGE = {
  items: [],
  appliedLimit: 0,
  totalEver: 0,
  degraded: true,
} as const;

/** Degraded not-found result returned when the Wails bindings are unavailable. */
export const DEGRADED_NOTIFICATION_DETAIL_RESULT = {
  found: false,
  item: {
    id: 0,
    createdAtMs: 0,
    title: '',
    body: '',
    level: '',
    source: '',
    actionCount: 0,
    rows: [],
    actions: [],
  },
  degraded: true,
} as const;

/** Degraded mutation result returned when the Wails bindings are unavailable. */
export const DEGRADED_NOTIFICATION_MUTATION_RESULT = {
  affected: 0,
  unreadCount: 0,
  degraded: true,
} as const;

/**
 * Degraded action result returned when the `ExecuteNotificationAction`
 * binding is unavailable -- mirrors the backend's own "no executor wired"
 * outcome (app_notification_center.go), the same `intent_unregistered`
 * refusal an empty `IntentRegistry` already produces server-side.
 */
export const DEGRADED_NOTIFICATION_ACTION_RESULT: NotificationActionResult = {
  executed: false,
  reason: 'intent_unregistered',
};

/** Module-local singleton container for the shared notification center source. */
export const NOTIFICATION_CENTER_SOURCE_STATE: { sharedSource: NotificationCenterSource | null } = {
  sharedSource: null,
};

/** Every Go binding name the notification center source depends on. */
export const NOTIFICATION_CENTER_BINDING_NAMES = [
  'ListNotifications',
  'GetNotification',
  'GetUnreadNotificationCount',
  'MarkNotificationsRead',
  'MarkNotificationsUnread',
  'ArchiveNotifications',
  'RestoreNotifications',
  'ExecuteNotificationAction',
] as const;
