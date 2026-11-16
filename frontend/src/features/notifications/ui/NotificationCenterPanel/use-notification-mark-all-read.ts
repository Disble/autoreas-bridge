import { useCallback, useMemo } from 'react';
import type { NotificationCenterSource, NotificationRow } from '../../../../shared/contracts/notification-center.types';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { toUnreadNotificationIds } from './notification-center-panel.helpers';

/** Everything `useNotificationMarkAllRead` needs from its caller. */
export interface NotificationMarkAllReadInput {
  readonly source: NotificationCenterSource;
  /** The rows the master list currently holds -- the records this action can reach. */
  readonly rows: readonly NotificationRow[];
  /** Called once the mutation settles, so the caller can refetch the list and the unread count. */
  readonly onMutated: () => void;
}

/** The header's bulk action and whether it currently has anything to act on. */
export interface NotificationMarkAllReadResult {
  readonly canMarkAllRead: boolean;
  readonly onMarkAllRead: () => void;
}

/**
 * Owns the header's "Mark all as read": it marks every unread record the
 * master list currently holds through `useBridgeMutation`, then lets the
 * caller refetch the list and the unread count (which lowers the rail badge).
 *
 * "All" is bounded by what has been loaded, and deliberately so: there is no
 * bulk-all binding on the Go side, only `MarkNotificationsRead(ids)`, and the
 * frontend has no honest way to name records it has never fetched. The button
 * disables itself the moment nothing loaded is unread, so it never claims to
 * have done work it could not do.
 */
export function useNotificationMarkAllRead(input: Readonly<NotificationMarkAllReadInput>): NotificationMarkAllReadResult {
  const { source, rows, onMutated } = input;

  // 4. Queries/Mutations
  const { mutate: markRead } = useBridgeMutation({
    mutationFn: (ids: readonly number[]) => source.markRead(ids),
    onSettled: () => onMutated(),
  });

  // 5. Derived State
  const unreadIds = useMemo(() => toUnreadNotificationIds(rows), [rows]);

  // 6. Callbacks
  const onMarkAllRead = useCallback(() => {
    if (unreadIds.length === 0) {
      return;
    }
    markRead(unreadIds);
  }, [markRead, unreadIds]);

  return { canMarkAllRead: unreadIds.length > 0, onMarkAllRead };
}
