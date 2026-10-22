import { ICON_ACTION_HOVER_TONE_CLASS, ICON_ACTION_REASON_SEPARATOR, ICON_ACTION_RESTING_TONE_CLASS } from './icon-action-button.constants';
import type { IconActionTone } from './icon-action-button.types';

/**
 * The tooltip's first line: the action name, plus the disabled reason after
 * " · " while the button is disabled and a reason exists.
 */
export function getIconActionTooltip(tooltip: string, isDisabled: boolean, disabledReason: string | undefined): string {
  if (!isDisabled || disabledReason === undefined || disabledReason === '') return tooltip;
  return `${tooltip}${ICON_ACTION_REASON_SEPARATOR}${disabledReason}`;
}

/** The button's tint classes: none without a tone, the resting tint while tinted, else the hover tint. */
export function getIconActionToneClass(tone: IconActionTone | undefined, isTinted: boolean): string | undefined {
  if (tone === undefined) return undefined;
  return isTinted ? ICON_ACTION_RESTING_TONE_CLASS[tone] : ICON_ACTION_HOVER_TONE_CLASS[tone];
}
