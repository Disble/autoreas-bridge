import type { IconActionTone } from './icon-action-button.types';

/** Hover delay before an icon-only action names itself; HeroUI's 1.5 s default reads as "no tooltip". */
export const ICON_ACTION_TOOLTIP_DELAY_MS = 300;

/** Separator between an action's name and the reason it is disabled. */
export const ICON_ACTION_REASON_SEPARATOR = ' · ';

/** Hover tint classes per tone. */
export const ICON_ACTION_HOVER_TONE_CLASS: Readonly<Record<IconActionTone, string>> = {
  accent: 'hover:text-accent',
  success: 'hover:text-success',
  warning: 'hover:text-warning',
  danger: 'hover:text-danger',
};

/** Resting tint classes per tone, for a button that keeps its tint. */
export const ICON_ACTION_RESTING_TONE_CLASS: Readonly<Record<IconActionTone, string>> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
