import { useCallback, useRef, useState } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationDetail as NotificationDetailDTO } from '../../../../shared/contracts/notification-center.types';
import { applyNotificationMutationUnreadCount } from '../../../../shared/store/notification-store/notification-store.helpers';

/** Everything `useNotificationOpenRecord` needs from its caller. */
export interface NotificationOpenRecordInput {
  readonly source: NotificationCenterSource;
}

/** The open-record state `useNotificationOpenRecord` exposes. */
export interface NotificationOpenRecordResult {
  /** The record currently open in the detail pane, or `null` while none is (or the last one opened was not found). */
  readonly openRecord: NotificationDetailDTO | null;
  readonly onOpenRecord: (id: number) => void;
}

/**
 * Owns which record the notification center currently has open: the
 * single-record `getNotification` read behind it, and the mark-read that
 * opening one performs (lifecycle spec, "read is set by opening the
 * detail"). Read state is deliberately set on the press rather than on the
 * read's result -- opening is what the user did, and a `getNotification`
 * that comes back degraded does not un-open it.
 *
 * That mark-read's own fresh `unreadCount` goes into the shared
 * notification store, so opening a record lowers the rail badge the same way
 * the selection bar's bulk mark-read does.
 */
export function useNotificationOpenRecord(input: Readonly<NotificationOpenRecordInput>): NotificationOpenRecordResult {
  const { source } = input;

  // 1. Refs
  const openedIdRef = useRef<number | null>(null);

  // 2. State
  const [openRecord, setOpenRecord] = useState<NotificationDetailDTO | null>(null);

  // 6. Callbacks
  const onOpenRecord = useCallback(
    (id: number) => {
      openedIdRef.current = id;

      void source.getNotification(id).then((result) => {
        if (openedIdRef.current !== id) {
          // A later press already won. Dropping this stale read keeps the
          // pane showing the record the user pressed last, not whichever
          // fetch happened to resolve last.
          return;
        }
        setOpenRecord(result.found ? result.item : null);
      });

      void source.markRead([id]).then(applyNotificationMutationUnreadCount);
    },
    [source],
  );

  return { onOpenRecord, openRecord };
}
