import { Button } from '@heroui/react';
import { IconActionButton } from '../IconActionButton/IconActionButton';
import type { LookupTriggerProps } from './lookup-modal.types';

/**
 * The button that opens a lookup modal. The enclosing `Modal` treats whichever
 * Button renders here as its own trigger, so neither variant needs a press
 * handler. The text variant is a form's visible action; the icon variant is the
 * shared icon-only action, named and tooltipped with the same label, for a
 * row's action group.
 */
export function LookupTrigger({ label, icon, variant, isDisabled }: Readonly<LookupTriggerProps>) {
  if (variant === 'text') {
    return (
      <Button isDisabled={isDisabled} variant="tertiary">
        {label}
      </Button>
    );
  }
  return <IconActionButton ariaLabel={label} icon={icon} isDisabled={isDisabled} tone="accent" tooltip={label} />;
}
