import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import chevronIcon from '@iconify-icons/solar/alt-arrow-right-linear';
import copyIcon from '@iconify-icons/solar/copy-linear';
import bridgeIcon from '@iconify-icons/solar/monitor-linear';
import phoneIcon from '@iconify-icons/solar/smartphone-linear';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ICON_ACTION_TOOLTIP_DELAY_MS } from '../../../../shared/ui/IconActionButton/icon-action-button.constants';
import { ACTIVITY_FEED_ROW_CLASS } from '../../feed/activity-feed.constants';
import { ACTIVITY_ROW_COPY_CLASS, ACTIVITY_ROW_DETAIL_CLASS, ACTIVITY_ROW_REPEAT_CLASS, ACTIVITY_ROW_TILE_CLASS } from './activity-feed-view.constants';
import type { ActivityFeedRowProps } from './activity-feed-view.types';

/**
 * One feed row: time, origin icon on a health tile, "subject · one short
 * fact", a `×N` badge when the line stands for several records, and `›`. The whole row opens the detail drawer. A failed row also offers
 * "Copy for AI" before `›`; it sits beside the row button, never inside it,
 * so copying opens nothing.
 */
export function ActivityFeedRow({ row, onSelect, onCopy }: ActivityFeedRowProps) {
  return (
    <div className="relative">
      <Button
        aria-current={row.isOpen ? 'true' : undefined}
        className={`${ACTIVITY_FEED_ROW_CLASS} h-auto justify-start text-left font-normal ${row.isOpen ? 'bg-default' : ''}`}
        data-feed-row={row.key}
        onPress={() => onSelect(row)}
        variant="ghost"
      >
        <span className="w-[52px] shrink-0 text-[13px] leading-normal tabular-nums text-muted">{row.time}</span>
        <span aria-label={row.originLabel} className={`grid size-7 shrink-0 place-items-center rounded-lg ${ACTIVITY_ROW_TILE_CLASS[row.health]}`} role="img" title={row.originLabel}>
          <Icon aria-hidden icon={row.origin === 'phone' ? phoneIcon : bridgeIcon} />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-sm font-medium leading-normal text-foreground">{row.subject}</span>
          {row.detail === '' ? null : <span className={`truncate text-sm leading-normal ${ACTIVITY_ROW_DETAIL_CLASS[row.health]}`}>{row.detail}</span>}
        </span>
        {row.repeat === undefined ? null : (
          <Tooltip delay={ICON_ACTION_TOOLTIP_DELAY_MS}>
            <Tooltip.Trigger className="inline-flex shrink-0" role="presentation" tabIndex={-1}>
              <span aria-label={row.repeat.label} className={ACTIVITY_ROW_REPEAT_CLASS} role="img">
                {row.repeat.badge}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              {row.repeat.label}
            </Tooltip.Content>
          </Tooltip>
        )}
        {row.canCopy ? <span aria-hidden className="w-8 shrink-0" /> : null}
        <Icon aria-hidden className="size-[18px] shrink-0 text-muted" icon={chevronIcon} />
      </Button>
      {row.canCopy ? (
        <div className={ACTIVITY_ROW_COPY_CLASS}>
          <IconActionButton ariaLabel="Copy for AI" icon={copyIcon} onPress={() => onCopy(row)} tooltip="Copy for AI" variant="ghost" />
        </div>
      ) : null}
    </div>
  );
}
