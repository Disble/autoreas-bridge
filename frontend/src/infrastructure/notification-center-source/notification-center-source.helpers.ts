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
  NotificationDetailResult,
  NotificationListRequest,
  NotificationMutationResult,
  NotificationPage,
} from '../../shared/contracts/notification-center.types';
import { hasGoBinding, invokeGoBinding } from '../wails-bindings.helpers';
import {
  DEGRADED_EMPTY_NOTIFICATION_PAGE,
  DEGRADED_NOTIFICATION_ACTION_RESULT,
  DEGRADED_NOTIFICATION_DETAIL_RESULT,
  DEGRADED_NOTIFICATION_MUTATION_RESULT,
  NOTIFICATION_CENTER_BINDING_NAMES,
  NOTIFICATION_CENTER_SOURCE_STATE,
} from './notification-center-source.constants';
import type { NotificationCenterSource } from './notification-center-source.types';

/**
 * Creates the singleton runtime-backed notification center source. Every
 * read or mutation degrades to an empty/not-found, `degraded: true` result
 * rather than rejecting when the Wails bindings are not yet attached.
 */
export function createNotificationCenterSource(): NotificationCenterSource {
  if (NOTIFICATION_CENTER_SOURCE_STATE.sharedSource !== null) {
    return NOTIFICATION_CENTER_SOURCE_STATE.sharedSource;
  }

  NOTIFICATION_CENTER_SOURCE_STATE.sharedSource = {
    listNotifications(request: NotificationListRequest): Promise<NotificationPage> {
      return invokeGoBinding<NotificationPage>(
        'ListNotifications',
        () => ListNotifications({ ...request, sources: [...request.sources], levels: [...request.levels] }),
        () => DEGRADED_EMPTY_NOTIFICATION_PAGE,
      );
    },
    getNotification(id: number): Promise<NotificationDetailResult> {
      return invokeGoBinding<NotificationDetailResult>(
        'GetNotification',
        () => GetNotification(id),
        () => DEGRADED_NOTIFICATION_DETAIL_RESULT,
      );
    },
    getUnreadCount(): Promise<number> {
      return invokeGoBinding<number>(
        'GetUnreadNotificationCount',
        () => GetUnreadNotificationCount(),
        () => 0,
      );
    },
    markRead(ids: readonly number[]): Promise<NotificationMutationResult> {
      return invokeGoBinding<NotificationMutationResult>(
        'MarkNotificationsRead',
        () => MarkNotificationsRead([...ids]),
        () => DEGRADED_NOTIFICATION_MUTATION_RESULT,
      );
    },
    markUnread(ids: readonly number[]): Promise<NotificationMutationResult> {
      return invokeGoBinding<NotificationMutationResult>(
        'MarkNotificationsUnread',
        () => MarkNotificationsUnread([...ids]),
        () => DEGRADED_NOTIFICATION_MUTATION_RESULT,
      );
    },
    archive(ids: readonly number[]): Promise<NotificationMutationResult> {
      return invokeGoBinding<NotificationMutationResult>(
        'ArchiveNotifications',
        () => ArchiveNotifications([...ids]),
        () => DEGRADED_NOTIFICATION_MUTATION_RESULT,
      );
    },
    restore(ids: readonly number[]): Promise<NotificationMutationResult> {
      return invokeGoBinding<NotificationMutationResult>(
        'RestoreNotifications',
        () => RestoreNotifications([...ids]),
        () => DEGRADED_NOTIFICATION_MUTATION_RESULT,
      );
    },
    executeAction(notificationId: number, actionId: string): Promise<NotificationActionResult> {
      return invokeGoBinding<NotificationActionResult>(
        'ExecuteNotificationAction',
        () => ExecuteNotificationAction(notificationId, actionId),
        () => DEGRADED_NOTIFICATION_ACTION_RESULT,
      );
    },
  };

  return NOTIFICATION_CENTER_SOURCE_STATE.sharedSource;
}

/** Reports whether every notification center binding is currently attached. */
export function isNotificationCenterRuntimeAvailable(): boolean {
  return NOTIFICATION_CENTER_BINDING_NAMES.every((name) => hasGoBinding(name));
}
