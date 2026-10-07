import { Tooltip } from '@heroui/react';
import { getAvailabilityIndicator } from './intake-panel.helpers';
import type { IntakeRowAvailabilityDotProps } from './intake-panel.types';

/**
 * The dot at the far right of a matched intake row: success once its episode 1
 * is online and it can be created, danger while it waits. A row still being
 * matched renders nothing, since its status chip already says so.
 */
export function IntakeRowAvailabilityDot({ row }: Readonly<IntakeRowAvailabilityDotProps>) {
  const indicator = getAvailabilityIndicator(row);
  if (indicator === null) {
    return null;
  }
  return (
    <Tooltip>
      <span
        aria-label={indicator.label}
        className={`size-2.5 shrink-0 rounded-full ${indicator.color === 'success' ? 'bg-success' : 'bg-danger'}`}
      />
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {indicator.label}
      </Tooltip.Content>
    </Tooltip>
  );
}
