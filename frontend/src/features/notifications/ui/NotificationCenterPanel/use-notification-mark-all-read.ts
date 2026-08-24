import { useCallback, useMemo } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import { applyNotificationMutationUnreadCount } from '../../../../shared/store/notification-store/notification-store.helpers';
import { toUnreadNotificationIds } from './notification-center-panel.helpers';

/** Everything `useNotificationMarkAllRead` needs from its caller. */
export interface NotificationMarkAllReadInput {
  readonly source: NotificationCenterSource;
  /** The rows the master list currently holds -- the records this action can reach. */
  readonly rows: readonly NotificationRow[];
  /** Called once the mutation resolves, so the caller can refetch the list. */
  readonly onMutated: () => void;
}

/** The header's bulk action and whether it currently has anything to act on. */
export interface NotificationMarkAllReadResult {
  readonly canMarkAllRead: boolean;
  readonly onMarkAllRead: () => void;
}

/**
 * Owns the header's "Mark all as read": it marks every unread record the
 * master list currently holds, feeds the mutation's own fresh unread count
 * into the shared store (which is what lowers the rail badge), and refetches.
 *
 * "All" is bounded by what has been loaded, and deliberately so: there is no
 * bulk-all binding on the Go side, only `MarkNotificationsRead(ids)`, and the
 * frontend has no honest way to name records it has never fetched. The button
 * disables itself the moment nothing loaded is unread, so it never claims to
 * have done work it could not do.
 */
export function useNotificationMarkAllRead(input: Readonly<NotificationMarkAllReadInput>): NotificationMarkAllReadResult {
  const { source, rows, onMutated } = input;

  // 5. Derived State
  const unreadIds = useMemo(() => toUnreadNotificationIds(rows), [rows]);

  // 6. Callbacks
  const onMarkAllRead = useCallback(() => {
    if (unreadIds.length === 0) {
      return;
    }
    void source.markRead(unreadIds).then((result) => {
      applyNotificationMutationUnreadCount(result);
      onMutated();
    });
  }, [source, unreadIds, onMutated]);

  return { canMarkAllRead: unreadIds.length > 0, onMarkAllRead };
}
