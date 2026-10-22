import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { MouseEvent } from 'react';
import { ICON_ACTION_TOOLTIP_DELAY_MS } from './icon-action-button.constants';
import { getIconActionToneClass, getIconActionTooltip } from './icon-action-button.helpers';
import type { IconActionButtonProps } from './icon-action-button.types';

/**
 * The design system's one shape for an icon-only action: a round `Button`
 * inside a `Tooltip` that always names it, after 300 ms on hover and at once on
 * keyboard focus. The tooltip trigger wraps the button so a disabled button,
 * which takes no pointer events, still explains itself. Without `onPress` the
 * button is the trigger of an enclosing Modal or Dropdown. Presentation only.
 */
export function IconActionButton({
  ariaLabel,
  tooltip,
  icon,
  variant = 'tertiary',
  tone,
  isTinted = false,
  isDisabled = false,
  disabledReason,
  detail,
  onPress,
  onContextMenu,
}: Readonly<IconActionButtonProps>) {
  return (
    <Tooltip delay={ICON_ACTION_TOOLTIP_DELAY_MS}>
      <Tooltip.Trigger className="inline-flex shrink-0 rounded-full" role="presentation" tabIndex={-1}>
        <Button
          aria-label={ariaLabel}
          className={getIconActionToneClass(tone, isTinted)}
          isDisabled={isDisabled}
          isIconOnly
          size="sm"
          variant={variant}
          onContextMenu={onContextMenu === undefined ? undefined : (event: MouseEvent) => {
            event.preventDefault();
            onContextMenu();
          }}
          onPress={onPress}
        >
          <Icon aria-hidden="true" className="size-[18px]" icon={icon} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        <span className="flex flex-col">
          <span>{getIconActionTooltip(tooltip, isDisabled, disabledReason)}</span>
          {detail === undefined ? null : <span className="break-all text-muted">{detail}</span>}
        </span>
      </Tooltip.Content>
    </Tooltip>
  );
}
