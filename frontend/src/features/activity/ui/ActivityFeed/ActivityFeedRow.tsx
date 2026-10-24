import { Button } from '@heroui/react';
import { Icon } from '@iconify/react';
import chevronIcon from '@iconify-icons/solar/alt-arrow-right-linear';
import bridgeIcon from '@iconify-icons/solar/monitor-linear';
import phoneIcon from '@iconify-icons/solar/smartphone-linear';
import { ACTIVITY_FEED_ROW_CLASS } from '../../feed/activity-feed.constants';
import { ACTIVITY_ROW_DETAIL_CLASS, ACTIVITY_ROW_TILE_CLASS } from './activity-feed-view.constants';
import type { ActivityFeedRowProps } from './activity-feed-view.types';

/**
 * One feed row: time, origin icon on a health tile, "subject · what changed"
 * and `›`. The whole row opens the detail drawer.
 */
export function ActivityFeedRow({ row, onSelect }: ActivityFeedRowProps) {
  return (
    <Button
      aria-current={row.isOpen ? 'true' : undefined}
      className={`${ACTIVITY_FEED_ROW_CLASS} h-auto justify-start text-left font-normal ${row.isOpen ? 'bg-default' : ''}`}
      data-feed-row={row.key}
      fullWidth
      onPress={() => onSelect(row)}
      variant="ghost"
    >
      <span className="w-12 shrink-0 text-sm tabular-nums text-muted">{row.time}</span>
      <span aria-label={row.originLabel} className={`grid size-7 shrink-0 place-items-center rounded-md ${ACTIVITY_ROW_TILE_CLASS[row.health]}`} role="img" title={row.originLabel}>
        <Icon aria-hidden icon={row.origin === 'phone' ? phoneIcon : bridgeIcon} />
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-sm font-medium text-foreground">{row.subject}</span>
        {row.detail === '' ? null : <span className={`truncate text-sm ${ACTIVITY_ROW_DETAIL_CLASS[row.health]}`}>{row.detail}</span>}
      </span>
      <Icon aria-hidden className="shrink-0 text-muted" icon={chevronIcon} />
    </Button>
  );
}
