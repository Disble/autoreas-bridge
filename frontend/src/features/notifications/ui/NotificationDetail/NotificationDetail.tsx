import { Card } from '@heroui/react';
import { buildNotificationMetaEntries, resolveNotificationActions } from './notification-detail.helpers';
import { NotificationDetailFooter } from './NotificationDetailFooter';
import { NotificationDetailHeader } from './NotificationDetailHeader';
import { NotificationDetailMeta } from './NotificationDetailMeta';
import { NotificationDetailRows } from './NotificationDetailRows';
import type { NotificationDetailProps } from './notification-detail.types';

/**
 * Dumb composition of the detail pane, top to bottom exactly as the
 * design-canvas `Main.dc.html` artboard lays it out: header (level chip,
 * source/time, title, body), the single bounded row-list block, the metadata
 * footer that says WHICH record this is, and the footer action area.
 *
 * Renders a "nothing selected" prompt when `detail` is `null`, mirroring
 * `TransactionDetail.tsx`'s own null-detail prompt.
 */
export function NotificationDetail({ detail, source }: Readonly<NotificationDetailProps>) {
  if (detail === null) {
    return (
      <Card>
        <Card.Content className="p-4 text-center text-default-400">
          <span className="text-sm">Select a notification to see its details.</span>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Content className="flex flex-col gap-4 p-5">
        <NotificationDetailHeader detail={detail} />
        <NotificationDetailRows actions={detail.actions} notificationId={detail.id} rows={detail.rows} source={source} />
        <NotificationDetailMeta entries={buildNotificationMetaEntries(detail)} />
      </Card.Content>
      <NotificationDetailFooter actions={resolveNotificationActions(detail.actions)} notificationId={detail.id} source={source} />
    </Card>
  );
}
