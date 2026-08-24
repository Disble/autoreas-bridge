import { Chip, Typography } from '@heroui/react';
import { formatNotificationWhen } from '../NotificationTable/notification-table.helpers';
import { formatLevelLabel, resolveLevelChipColor } from './notification-detail.helpers';
import type { NotificationDetailHeaderProps } from './notification-detail.types';

/**
 * The detail pane's header: a level chip, the source and formatted
 * timestamp, the record's title, and its body text.
 */
export function NotificationDetailHeader({ detail }: Readonly<NotificationDetailHeaderProps>) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={resolveLevelChipColor(detail.level)} size="sm" variant="soft">
          <Chip.Label>{formatLevelLabel(detail.level)}</Chip.Label>
        </Chip>
        <span className="text-xs text-default-500">
          {detail.source} · {formatNotificationWhen(detail.createdAtMs)}
        </span>
      </div>
      <Typography type="h2">{detail.title}</Typography>
      <p className="text-sm text-default-600">{detail.body}</p>
    </header>
  );
}
