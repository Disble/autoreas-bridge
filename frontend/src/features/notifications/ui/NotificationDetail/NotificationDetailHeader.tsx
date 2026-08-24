import { Chip, Typography } from '@heroui/react';
import { formatDetailWhenLabel, formatLevelLabel, resolveLevelChipColor } from './notification-detail.helpers';
import type { NotificationDetailHeaderProps } from './notification-detail.types';

/**
 * The detail pane's header: a level chip, the source and the record's time at
 * both scales, its title, and its body text. The time reads
 * `Downloads · 2026-08-24 14:32:11 · 5m ago` (design-canvas `Main.dc.html`) —
 * the absolute half says when it happened and the relative half says whether
 * it still matters.
 */
export function NotificationDetailHeader({ detail }: Readonly<NotificationDetailHeaderProps>) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={resolveLevelChipColor(detail.level)} size="sm" variant="soft">
          <Chip.Label>{formatLevelLabel(detail.level)}</Chip.Label>
        </Chip>
        <span className="text-xs text-default-500">
          {detail.source} · {formatDetailWhenLabel(detail.createdAtMs)}
        </span>
      </div>
      <Typography type="h2">{detail.title}</Typography>
      <p className="text-sm text-default-600">{detail.body}</p>
    </header>
  );
}
