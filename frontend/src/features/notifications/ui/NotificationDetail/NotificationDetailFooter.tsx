import { Button, Card, Toolbar } from '@heroui/react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import {
  NOTIFICATION_DETAIL_ARCHIVE_LABEL,
  NOTIFICATION_DETAIL_FOOTER_TESTID,
  NOTIFICATION_DETAIL_MARK_UNREAD_LABEL,
} from './notification-detail.constants';
import { NotificationDetailActionButton } from './NotificationDetailActionButton';
import type { NotificationDetailFooterProps } from './notification-detail.types';
import { useNotificationArchive } from './use-notification-archive';
import { useNotificationMarkUnread } from './use-notification-mark-unread';

/**
 * The pane's footer action area, exactly as the artboard draws it
 * (design-canvas `Main.dc.html`): `Open Downloads · Archive · Mark unread` —
 * the record's own whole-notification actions first, then the two lifecycle
 * verbs the app itself owns.
 *
 * The footer used to disappear entirely for a record carrying no
 * whole-notification action, on the argument that an action area which appears
 * empty is worse than none and that archiving stays reachable from the master
 * list's selection bar. That premise died with `Mark unread`. The two
 * lifecycle verbs apply to EVERY record, so the toolbar is never empty; and
 * unlike archive, mark-unread has no second surface anywhere — there is no
 * bulk mark-unread in the selection bar. Keeping the old rule would have made
 * the artboard's reversible read axis unreachable for every notification that
 * carries no action of its own, which is every `season`, `sync` and `device`
 * record this app produces (`app_season_availability.go`,
 * `app_startup_runtime.go`). Built-but-unreachable is the exact defect class
 * this slice exists to close.
 */
export function NotificationDetailFooter({ actions, notificationId, onReadStateChanged, source }: Readonly<NotificationDetailFooterProps>) {
  return (
    <Card.Footer data-testid={NOTIFICATION_DETAIL_FOOTER_TESTID}>
      <Toolbar aria-label="Notification actions" className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <NotificationDetailActionButton action={action} key={action.id} notificationId={notificationId} source={source} variant="primary" />
        ))}
        <NotificationDetailArchiveButton notificationId={notificationId} source={source} />
        <NotificationDetailMarkUnreadButton notificationId={notificationId} onReadStateChanged={onReadStateChanged} source={source} />
      </Toolbar>
    </Card.Footer>
  );
}

/**
 * The footer's archive button, driven by `useNotificationArchive` against the
 * existing `ArchiveNotifications` binding. Kept apart from the action buttons
 * beside it because it is not a stored intent token: it is a lifecycle verb
 * the app already owns, so it needs no registry entry and no `rowRef`.
 */
function NotificationDetailArchiveButton({
  notificationId,
  source,
}: Readonly<{ readonly notificationId: number; readonly source?: NotificationCenterSource }>) {
  const { archive, isDisabled } = useNotificationArchive(notificationId, source);

  return (
    <Button isDisabled={isDisabled} onPress={archive} size="sm" variant="secondary">
      {NOTIFICATION_DETAIL_ARCHIVE_LABEL}
    </Button>
  );
}

/**
 * The footer's mark-unread button, driven by `useNotificationMarkUnread`
 * against the `MarkNotificationsUnread` binding. It sits beside archive
 * because both are lifecycle verbs the app owns rather than stored intent
 * tokens, but the two move different axes: archiving takes the record off the
 * active list (and marks it read on the way), while this one only puts the
 * read state back — an archived record marked unread stays archived.
 */
function NotificationDetailMarkUnreadButton({
  notificationId,
  onReadStateChanged,
  source,
}: Readonly<{
  readonly notificationId: number;
  readonly onReadStateChanged?: (recordIds: readonly number[], isRead: boolean) => void;
  readonly source?: NotificationCenterSource;
}>) {
  const { isDisabled, markUnread } = useNotificationMarkUnread(notificationId, source, onReadStateChanged);

  return (
    <Button isDisabled={isDisabled} onPress={markUnread} size="sm" variant="secondary">
      {NOTIFICATION_DETAIL_MARK_UNREAD_LABEL}
    </Button>
  );
}
