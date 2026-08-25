import { useEffect, useRef } from 'react';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { notificationSource } from '../../../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import { createNotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { toBackendAppNotification } from './backend-toast.helpers';
import { KINDS_OWNED_BY_A_DEDICATED_RESOLVER } from './notification-resolver.constants';

/**
 * Subscribes to the backend `notification.push` event stream and pushes
 * ephemeral AppNotification toast(s) for each event received, and to the
 * `notification.archived` event stream to close a live toast for a record
 * that just got archived elsewhere (design.md §3 Decision G).
 *
 * A kind listed in `KINDS_OWNED_BY_A_DEDICATED_RESOLVER` is skipped here:
 * another resolver already renders it, with affordances this generic path
 * cannot reproduce. The record still exists in the Center either way — only
 * the toast is claimed.
 *
 * Bug A fix: `Source`, `CorrelationID`, `Timestamp`, and the event's
 * persisted record id (`RecordID`) are forwarded unchanged instead of being
 * dropped -- a dropped `CorrelationID`/`Source` made every backend event an
 * uncorrelatable, deduplication-less ephemeral toast.
 *
 * The mapping itself lives in `toBackendAppNotification`, which also forwards
 * the rows and the whole-notification verbs this hook used to drop. A press
 * goes back through `ExecuteNotificationAction`, the SAME executor the detail
 * pane presses through -- one gate, more than one door
 * (docs/adr/016-notification-adapters-project-not-truncate.md).
 */
export function useBackendEventResolver(
  push: (notification: AppNotification) => void,
  remove: (key: string | number) => void,
  source: NotificationSource = notificationSource,
  centerSource: NotificationCenterSource = createNotificationCenterSource(),
): void {
  const pushRef = useRef(push);
  const removeRef = useRef(remove);

  // Refreshed in an effect rather than during render: React may discard a
  // render pass, and a ref written during one that never commits leaves the
  // subscription below calling a stale callback. The subscription itself must
  // stay keyed on `source` alone, which is why the refs exist at all.
  useEffect(() => {
    pushRef.current = push;
    removeRef.current = remove;
  });

  useEffect(() => {
    return source.subscribe((notification) => {
      if (KINDS_OWNED_BY_A_DEDICATED_RESOLVER.has(notification.Kind ?? '')) {
        return;
      }

      pushRef.current(
        toBackendAppNotification(notification, (recordId, actionId) => {
          void centerSource.executeAction(recordId, actionId);
        }),
      );
    });
  }, [centerSource, source]);

  useEffect(() => {
    return source.subscribeArchived((recordIds) => {
      for (const recordId of recordIds) {
        removeRef.current(recordId);
      }
    });
  }, [source]);

  return undefined;
}
