import { useCallback } from 'react';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { NOTIFICATIONS_UNREAD_COUNT_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { toNotificationUnreadCount } from './notification-center-panel.helpers';
import type { NotificationUnreadCountInput, NotificationUnreadCountResult } from './notification-center-panel.types';

/**
 * Reads the unread count through the same query key the nav rail badge reads
 * (`NOTIFICATIONS_UNREAD_COUNT_KEY`), so the header and the badge share one
 * cached answer and cannot disagree. Every lifecycle mutation the panel
 * commits reads it again, which is what lowers (or raises) both.
 * @param input The source, and the list refresh and read-state patch it composes with.
 * @returns The count to show and the two refresh callbacks.
 */
export function useNotificationUnreadCount({ source, refetchList, applyReadState }: NotificationUnreadCountInput): NotificationUnreadCountResult {
  // 4. Queries/Mutations
  const unreadQuery = useBridgeQuery({
    queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY,
    queryFn: () => source.getUnreadCount(),
    module: 'notifications',
  });

  // 5. Derived State
  const unreadCount = toNotificationUnreadCount(toAsyncView(unreadQuery));

  // 6. Callbacks
  const { refetch: refetchUnreadCount } = unreadQuery;
  const onMutated = useCallback(() => {
    refetchList();
    void refetchUnreadCount();
  }, [refetchList, refetchUnreadCount]);

  const onReadStateChanged = useCallback(
    (recordIds: readonly number[], isRead: boolean) => {
      applyReadState(recordIds, isRead);
      void refetchUnreadCount();
    },
    [applyReadState, refetchUnreadCount],
  );

  return { unreadCount, onMutated, onReadStateChanged };
}
