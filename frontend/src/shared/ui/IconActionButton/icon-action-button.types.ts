import type { IconifyIcon } from '@iconify/react';

/** The meaning an icon-only action tints toward on hover (and keeps while `isTinted`). */
export type IconActionTone = 'accent' | 'success' | 'warning' | 'danger';

/** Props for an icon-only action button whose tooltip names the action. */
export interface IconActionButtonProps {
  /** Accessible name; may be more specific than the tooltip (`Edit Frieren` vs `Edit anime`). */
  readonly ariaLabel: string;
  /** The visible name of the action, verb first, shown on hover and focus. */
  readonly tooltip: string;
  /** The icon that stands for the action. */
  readonly icon: IconifyIcon;
  /** HeroUI button variant: `tertiary` (default) for record actions, `ghost` for navigation. */
  readonly variant?: 'ghost' | 'tertiary';
  /** The meaning the icon tints toward on hover. */
  readonly tone?: IconActionTone;
  /** Keeps the tone tint without hover, for a state the button reports (a folder override). */
  readonly isTinted?: boolean;
  /** Disables the button, for example while a mutation runs. The tooltip still shows. */
  readonly isDisabled?: boolean;
  /** Why the button is disabled, appended to the tooltip after " · " while disabled. */
  readonly disabledReason?: string;
  /** Extra data (a path, a URL) on a second, muted tooltip line, never instead of the name. */
  readonly detail?: string;
  /** Runs the action. Omitted when an enclosing Modal or Dropdown treats the button as its trigger. */
  readonly onPress?: () => void;
  /** Runs on a secondary click (context menu), whose default menu is suppressed. */
  readonly onContextMenu?: () => void;
}
