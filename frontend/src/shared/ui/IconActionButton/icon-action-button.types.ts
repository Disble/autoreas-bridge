import type { IconifyIcon } from '@iconify/react';

/** Props for an icon-only action button whose tooltip names the action. */
export interface IconActionButtonProps {
  /** Accessible name; may be more specific than the tooltip (`Edit Frieren` vs `Edit anime`). */
  readonly ariaLabel: string;
  /** The visible name of the action, shown on hover and focus. */
  readonly tooltip: string;
  /** The icon that stands for the action. */
  readonly icon: IconifyIcon;
  /** HeroUI button variant: `ghost` for navigation, `tertiary` for card actions. */
  readonly variant: 'ghost' | 'tertiary';
  /** Disables the button, for example while a mutation runs. */
  readonly isDisabled?: boolean;
  /** Runs the action. */
  readonly onPress: () => void;
}
