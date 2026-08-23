import type {
  NotificationDetailResult,
  NotificationListRequest,
  NotificationMutationResult,
  NotificationPage,
} from '../../shared/contracts/notification-center.types';

/**
 * In-process read/write source over the notification center inbox, backed by
 * the six Wails-bound `ListNotifications`/`GetNotification`/
 * `GetUnreadNotificationCount`/`MarkNotificationsRead`/`ArchiveNotifications`/
 * `RestoreNotifications` methods (design.md §10). Every method degrades to
 * an empty/not-found, `degraded: true` result instead of throwing when the
 * bindings are unavailable.
 */
export interface NotificationCenterSource {
  readonly listNotifications: (request: NotificationListRequest) => Promise<NotificationPage>;
  readonly getNotification: (id: number) => Promise<NotificationDetailResult>;
  readonly getUnreadCount: () => Promise<number>;
  readonly markRead: (ids: readonly number[]) => Promise<NotificationMutationResult>;
  readonly archive: (ids: readonly number[]) => Promise<NotificationMutationResult>;
  readonly restore: (ids: readonly number[]) => Promise<NotificationMutationResult>;
}
