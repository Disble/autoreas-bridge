import { Button, Card, Toolbar } from '@heroui/react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { NOTIFICATION_DETAIL_ARCHIVE_LABEL, NOTIFICATION_DETAIL_FOOTER_TESTID } from './notification-detail.constants';
import { NotificationDetailActionButton } from './NotificationDetailActionButton';
import type { NotificationDetailFooterProps } from './notification-detail.types';
import { useNotificationArchive } from './use-notification-archive';

/**
 * The pane's footer action area (design-canvas `Main.dc.html`): the record's
 * own whole-notification actions, plus archive. These are the actions the
 * artboard draws as `Open Downloads · Archive`, and until now the pane
 * fetched the first kind and threw it away — `resolveRowActions` resolved
 * strictly from `row.actionIds`, which a whole-notification action has no
 * entry in.
 *
 * A record carrying no whole-notification action renders NO footer at all,
 * archive included: an action area that appears empty is worse than no action
 * area, and archiving stays reachable from the master list's own selection
 * bar. `Mark unread`, the artboard's third footer button, is deliberately
 * absent — no backend method puts a read record back (task L.4.6), and a
 * button that only pretends to is worse than a missing one.
 */
export function NotificationDetailFooter({ actions, notificationId, source }: Readonly<NotificationDetailFooterProps>) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <Card.Footer data-testid={NOTIFICATION_DETAIL_FOOTER_TESTID}>
      <Toolbar aria-label="Notification actions" className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <NotificationDetailActionButton action={action} key={action.id} notificationId={notificationId} source={source} variant="primary" />
        ))}
        <NotificationDetailArchiveButton notificationId={notificationId} source={source} />
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
