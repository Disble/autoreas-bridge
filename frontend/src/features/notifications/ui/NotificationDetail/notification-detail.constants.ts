import type { AppNotificationSeverity } from '../../../../shared/contracts/app-notification.types';

/**
 * Maps the closed `AppNotificationSeverity` set to the `Chip` `color` prop
 * used for the header's level chip. Deliberately the same string set
 * `SEVERITY_TO_VARIANT` (`NotificationToasts/notification-resolver.constants.ts`)
 * already maps toast severity to -- HeroUI's `Chip` and `Toast` variant
 * unions happen to share these four names, but this is its own mapping so a
 * future divergence between the two unions never silently breaks the other.
 */
export const SEVERITY_TO_CHIP_COLOR: Record<AppNotificationSeverity, 'accent' | 'danger' | 'success' | 'warning'> = {
  error: 'danger',
  info: 'accent',
  success: 'success',
  warning: 'warning',
};

/**
 * Inline messages shown for each of the four closed refusal reasons
 * (notification-actions spec, "A refusal is always one of exactly four
 * reasons"). Slice 5 is the first slice that can ever produce
 * `target_missing`/`already_executed`/`foreign_action` from a real press;
 * `intent_unregistered` is reachable today because `use-notification-action`
 * settles every inert press to it (Task-Planning Note A).
 */
export const REFUSAL_REASON_MESSAGES: Readonly<Record<string, string>> = {
  already_executed: 'This action already ran.',
  foreign_action: "This action doesn't belong to this notification.",
  intent_unregistered: 'This action is not available yet.',
  target_missing: 'The thing this action pointed at is gone.',
};

/** Fallback inline message for a refusal reason outside the closed set above. */
export const UNKNOWN_REFUSAL_MESSAGE = 'This action was refused.';

/** Accessible label for the collapsed-row summary block. */
export const NOTIFICATION_DETAIL_COLLAPSED_ROW_ARIA_LABEL = 'Collapsed rows';
