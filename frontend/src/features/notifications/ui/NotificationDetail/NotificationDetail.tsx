import { Card } from '@heroui/react';
import { NotificationDetailHeader } from './NotificationDetailHeader';
import { NotificationDetailRows } from './NotificationDetailRows';
import type { NotificationDetailProps } from './notification-detail.types';

/**
 * Dumb composition of the detail pane: header (level chip, source/time,
 * title, body) plus the single bounded row-list block. Renders a
 * "nothing selected" prompt when `detail` is `null`, mirroring
 * `TransactionDetail.tsx`'s own null-detail prompt.
 */
export function NotificationDetail({ detail }: Readonly<NotificationDetailProps>) {
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
        <NotificationDetailRows actions={detail.actions} rows={detail.rows} />
      </Card.Content>
    </Card>
  );
}
