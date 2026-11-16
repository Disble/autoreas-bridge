import { useCallback, useState } from 'react';
import type {
  NotificationCenterSource,
  NotificationDetail as NotificationDetailDTO,
} from '../../../../shared/contracts/notification-center.types';
import { notificationsKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';

/** Everything `useNotificationOpenRecord` needs from its caller. */
export interface NotificationOpenRecordInput {
  readonly source: NotificationCenterSource;
  /**
   * Told which records the opening mark-read committed, so the master list
   * can drop their unread dot in place and the unread count is read again.
   * Absent for callers that render no list beside the pane.
   */
  readonly onReadStateChanged?: (recordIds: readonly number[], isRead: boolean) => void;
}

/** The open-record state `useNotificationOpenRecord` exposes. */
export interface NotificationOpenRecordResult {
  /** The record currently open in the detail pane, or `null` while none is (or the last one opened was not found). */
  readonly openRecord: NotificationDetailDTO | null;
  readonly onOpenRecord: (id: number) => void;
}

/**
 * Owns which record the notification center currently has open: the
 * single-record `getNotification` read behind it (`useBridgeQuery` on the
 * `notifications` module, keyed by the pressed id, so the pane shows the
 * record pressed last and never whichever read resolved last), and the
 * mark-read that opening one performs (lifecycle spec, "read is set by opening
 * the detail"). Read state is deliberately set on the press rather than on the
 * read's result -- opening is what the user did, and a failed
 * `getNotification` does not un-open it.
 *
 * `onReadStateChanged` lets the master-list row the user just pressed drop its
 * unread dot and the rail badge fall, and fires only for a mutation that
 * actually committed -- a failed mark-read left the record unread in the
 * store, and clearing its dot would make the list state the opposite of what
 * the store holds.
 */
export function useNotificationOpenRecord(input: Readonly<NotificationOpenRecordInput>): NotificationOpenRecordResult {
  const { onReadStateChanged, source } = input;

  // 2. State
  const [openedId, setOpenedId] = useState<number | null>(null);

  // 4. Queries/Mutations
  const detail = useBridgeQuery({
    queryKey: notificationsKeys.key('detail', openedId),
    queryFn: () => source.getNotification(openedId ?? 0),
    module: 'notifications',
    enabled: openedId !== null,
  });
  const { mutate: markRead } = useBridgeMutation({
    mutationFn: (id: number) => source.markRead([id]),
    onSuccess: (_result, id) => onReadStateChanged?.([id], true),
  });

  // 5. Derived State
  const openRecord: NotificationDetailDTO | null = detail.data?.found === true ? detail.data.item : null;

  // 6. Callbacks
  const onOpenRecord = useCallback(
    (id: number) => {
      setOpenedId(id);
      markRead(id);
    },
    [markRead],
  );

  return { onOpenRecord, openRecord };
}
