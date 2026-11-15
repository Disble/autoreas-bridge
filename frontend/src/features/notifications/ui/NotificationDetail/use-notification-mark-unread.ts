import { useCallback, useRef, useState } from 'react';
import type { NotificationCenterSource } from '../../../../shared/contracts/notification-center.types';
import { BRIDGE_NOTIFICATION_CENTER_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import type { UseNotificationMarkUnreadResult } from './notification-detail.types';

/**
 * Drives the detail pane's "Mark unread" button against the
 * `MarkNotificationsUnread` binding (`source.markUnread` through `useBridgeMutation`, injectable so tests
 * can supply a fake — mirrors `use-notification-archive.ts`'s own injectable
 * source). It is the reverse half of the read axis the `Lifecycle.dc.html`
 * artboard promises: read is *"Reversible — 'mark unread' puts it back"*.
 *
 * `onReadStateChanged` is what makes the verb visible: the panel stamps the
 * master-list row beside the pane unread and reads the unread count again, so
 * the rail badge CLIMBS. It fires only when the mutation committed: a failed
 * one changed nothing in the store, and a dot restored over it would be the
 * shape of a success that did not happen.
 *
 * Unlike archive, this button does NOT latch down once it settles. Marking an
 * already-unread record unread lands on exactly the same state, and opening
 * the pane's record marks it read again behind the button — a latched button
 * would then be claiming there is nothing left to do about a record that is,
 * once again, read. So the only disabled window is the in-flight one, guarded
 * by a ref as well as by state: two synchronous presses in the same event both
 * read the same stale state before React re-renders.
 */
export function useNotificationMarkUnread(
  notificationId: number,
  source: NotificationCenterSource = BRIDGE_NOTIFICATION_CENTER_SOURCE,
  onReadStateChanged?: (recordIds: readonly number[], isRead: boolean) => void,
): UseNotificationMarkUnreadResult {
  // 1. Refs
  const isMarkUnreadInFlightRef = useRef(false);

  // 2. State
  const [isDisabled, setIsDisabled] = useState(false);

  // 4. Queries/Mutations
  const { mutate: markRecordUnread } = useBridgeMutation({
    mutationFn: (id: number) => source.markUnread([id]),
    onSuccess: (_result, id) => onReadStateChanged?.([id], false),
    onSettled: () => {
      isMarkUnreadInFlightRef.current = false;
      setIsDisabled(false);
    },
  });

  // 6. Callbacks
  const markUnread = useCallback(() => {
    if (isMarkUnreadInFlightRef.current) {
      return;
    }

    isMarkUnreadInFlightRef.current = true;
    setIsDisabled(true);
    markRecordUnread(notificationId);
  }, [markRecordUnread, notificationId]);

  return { isDisabled, markUnread };
}
