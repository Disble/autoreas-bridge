import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { LookupTriggerProps } from './lookup-modal.types';

/**
 * The button that opens a lookup modal. The enclosing `Modal` treats whichever
 * Button renders here as its own trigger, so neither variant needs a press
 * handler. The text variant is a form's visible action; the icon variant is a
 * round tertiary button named and tooltipped with the same label, for a row's
 * action group.
 */
export function LookupTrigger({ label, icon, variant, isDisabled }: Readonly<LookupTriggerProps>) {
  if (variant === 'text') {
    return (
      <Button isDisabled={isDisabled} variant="tertiary">
        {label}
      </Button>
    );
  }
  return (
    <Tooltip>
      <Button isIconOnly aria-label={label} className="hover:text-accent" isDisabled={isDisabled} size="sm" variant="tertiary">
        <Icon className="size-4" icon={icon} />
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}
