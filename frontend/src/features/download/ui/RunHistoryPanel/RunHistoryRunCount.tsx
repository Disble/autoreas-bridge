import { Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import type { RunHistoryRunCountProps } from './run-history-panel.types';

/** One counter beside a run: its icon in the outcome color, the number in muted text, the meaning on hover. */
export function RunHistoryRunCount({ count, icon, iconClassName, label }: Readonly<RunHistoryRunCountProps>) {
  return (
    <Tooltip>
      <span aria-label={`${count} ${label}`} className="inline-flex items-center gap-0.5 whitespace-nowrap" role="img">
        <Icon aria-hidden="true" className={`size-3.5 ${iconClassName}`} icon={icon} />
        {count}
      </span>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {`${count} ${label}`}
      </Tooltip.Content>
    </Tooltip>
  );
}
