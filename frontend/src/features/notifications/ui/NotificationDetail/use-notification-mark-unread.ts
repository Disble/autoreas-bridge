import { useCallback, useRef, useState } from 'react';
import { createNotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { applyNotificationMutationUnreadCount } from '../../../../shared/store/notification-store/notification-store.helpers';
import type { UseNotificationMarkUnreadResult } from './notification-detail.types';

/**
 * Drives the detail pane's "Mark unread" button against the
 * `MarkNotificationsUnread` binding (`source.markUnread`, injectable so tests
 * can supply a fake — mirrors `use-notification-archive.ts`'s own injectable
 * source). It is the reverse half of the read axis the `Lifecycle.dc.html`
 * artboard promises: read is *"Reversible — 'mark unread' puts it back"*.
 *
 * The mutation's own fresh `unreadCount` goes straight into the shared
 * notification store, which is the whole point of the verb: the rail badge
 * has to CLIMB. The count is taken verbatim from the envelope rather than
 * derived from how many records were affected, exactly as every other
 * lifecycle mutation feeds it.
 *
 * `onReadStateChanged` is the second half of that, and it is what makes the
 * verb visible where the user is actually looking. Moving only the badge left
 * the master-list row beside the pane still rendered as read, so one screen
 * told both stories at once. It fires only when the mutation committed: a
 * degraded result changed nothing in the store, and a dot restored over it
 * would be the shape of a success that did not happen.
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
  source: NotificationCenterSource = createNotificationCenterSource(),
  onReadStateChanged?: (recordIds: readonly number[], isRead: boolean) => void,
): UseNotificationMarkUnreadResult {
  // 1. Refs
  const isMarkUnreadInFlightRef = useRef(false);

  // 2. State
  const [isDisabled, setIsDisabled] = useState(false);

  // 6. Callbacks
  const markUnread = useCallback(() => {
    if (isMarkUnreadInFlightRef.current) {
      return;
    }

    isMarkUnreadInFlightRef.current = true;
    setIsDisabled(true);
    void source.markUnread([notificationId]).then((result) => {
      isMarkUnreadInFlightRef.current = false;
      setIsDisabled(false);
      applyNotificationMutationUnreadCount(result);
      if (!result.degraded) {
        onReadStateChanged?.([notificationId], false);
      }
    });
  }, [notificationId, onReadStateChanged, source]);

  return { isDisabled, markUnread };
}
