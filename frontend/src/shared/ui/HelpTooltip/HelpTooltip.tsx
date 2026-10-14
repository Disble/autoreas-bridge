import questionIcon from '@iconify-icons/tabler/question-mark';
import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { HelpTooltipProps } from './help-tooltip.types';

/**
 * Renders the small "(?)" icon button that explains the label beside it in a
 * tooltip, on hover or keyboard focus. Presentation only: the caller owns the copy.
 */
export function HelpTooltip({ label, message }: Readonly<HelpTooltipProps>) {
  return (
    <Tooltip delay={0}>
      <Button aria-label={label} isIconOnly className="size-5" variant="tertiary">
        <Icon aria-hidden="true" className="size-4" icon={questionIcon} />
      </Button>
      <Tooltip.Content showArrow className="max-w-72">
        <Tooltip.Arrow />
        {message}
      </Tooltip.Content>
    </Tooltip>
  );
}
