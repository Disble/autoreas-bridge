import { Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import { RUN_HISTORY_TONE_ICON_CLASS } from './run-history-panel.constants';
import type { RunHistoryStatusIconProps } from './run-history-panel.types';

/** A run status as an icon with a tooltip: colored by tone, turning while the run is live. */
export function RunHistoryStatusIcon({ status }: Readonly<RunHistoryStatusIconProps>) {
  return (
    <Tooltip>
      <span aria-label={status.label} className={`inline-grid size-5 shrink-0 place-items-center ${RUN_HISTORY_TONE_ICON_CLASS[status.tone]}`} role="img">
        <Icon aria-hidden="true" className={`size-[18px] ${status.tone === 'accent' ? 'animate-spin motion-reduce:animate-none [animation-duration:1.6s]' : ''}`} icon={status.icon} />
      </span>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {status.label}
      </Tooltip.Content>
    </Tooltip>
  );
}
