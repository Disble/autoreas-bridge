import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { IconActionButtonProps } from './icon-action-button.types';

/**
 * A secondary action as an icon-only `Button` inside a `Tooltip` naming it,
 * the design system's shape for secondary actions. Presentation only.
 */
export function IconActionButton({ ariaLabel, icon, isDisabled = false, onPress, tooltip, variant }: Readonly<IconActionButtonProps>) {
  return (
    <Tooltip delay={300}>
      <Button aria-label={ariaLabel} isDisabled={isDisabled} isIconOnly size="sm" variant={variant} onPress={onPress}>
        <Icon aria-hidden="true" className="size-[18px]" icon={icon} />
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
