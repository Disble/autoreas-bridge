import {
  ArchiveNotifications,
  ExecuteNotificationAction,
  GetNotification,
  GetUnreadNotificationCount,
  ListNotifications,
  MarkNotificationsRead,
  MarkNotificationsUnread,
  RestoreNotifications,
} from '../../../wailsjs/go/desktop/App';
import type {
  NotificationActionResult,
  NotificationCenterSource,
  NotificationDetailResult,
  NotificationMutationResult,
  NotificationPage,
} from '../../shared/contracts/notification-center.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one notification-center binding: its rejection becomes a `BridgeError`,
 * and a binding that never attaches rejects as `unavailable` instead of
 * answering a fallback value.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callNotificationCenterBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * The Wails adapter of the `NotificationCenterSource` port (ADR-032 §4), built
 * once in `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every call
 * rejects with the notifications module's `unavailable` / `failed_precondition`
 * failure rather than answer an empty page, a zero count or a degraded envelope.
 * @returns The source.
 */
export function createNotificationCenterSource(): NotificationCenterSource {
  return {
    listNotifications: (request) =>
      callNotificationCenterBinding<NotificationPage>('ListNotifications', () =>
        ListNotifications({ ...request, sources: [...request.sources], levels: [...request.levels] }),
      ),
    getNotification: (id) => callNotificationCenterBinding<NotificationDetailResult>('GetNotification', () => GetNotification(id)),
    getUnreadCount: () => callNotificationCenterBinding('GetUnreadNotificationCount', () => GetUnreadNotificationCount()),
    markRead: (ids) => callNotificationCenterBinding<NotificationMutationResult>('MarkNotificationsRead', () => MarkNotificationsRead([...ids])),
    markUnread: (ids) => callNotificationCenterBinding<NotificationMutationResult>('MarkNotificationsUnread', () => MarkNotificationsUnread([...ids])),
    archive: (ids) => callNotificationCenterBinding<NotificationMutationResult>('ArchiveNotifications', () => ArchiveNotifications([...ids])),
    restore: (ids) => callNotificationCenterBinding<NotificationMutationResult>('RestoreNotifications', () => RestoreNotifications([...ids])),
    executeAction: (notificationId, actionId) =>
      callNotificationCenterBinding<NotificationActionResult>('ExecuteNotificationAction', () => ExecuteNotificationAction(notificationId, actionId)),
  };
}
