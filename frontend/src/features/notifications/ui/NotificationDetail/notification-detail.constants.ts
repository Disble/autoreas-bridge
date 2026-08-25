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

/**
 * `data-testid` for one action button's inline refusal message. Rendering
 * is keyed on `refusalMessage !== undefined` alone (not also `status`), so a
 * test needs an element-presence check independent of any specific message
 * text to prove the "no message" branch actually renders nothing -- an
 * empty `<span>` would otherwise look identical to no span at all to a
 * text-based query.
 */
export const NOTIFICATION_DETAIL_ROW_REFUSAL_MESSAGE_TESTID = 'notification-detail-row-refusal-message';

/**
 * `data-testid` for the pane's footer action area. Presence of the block
 * itself is what a test needs: an empty toolbar satisfies every text-absence
 * assertion too, and a record with nothing to do must not grow one.
 */
export const NOTIFICATION_DETAIL_FOOTER_TESTID = 'notification-detail-footer';

/** Label of the footer's archive button, one of the two lifecycle verbs the pane itself carries out. */
export const NOTIFICATION_DETAIL_ARCHIVE_LABEL = 'Archive';

/**
 * Label of the footer's mark-unread button, the other one. The read axis is
 * reversible in both directions (design-canvas `Lifecycle.dc.html`), and this
 * is the only control anywhere that reverses it.
 */
export const NOTIFICATION_DETAIL_MARK_UNREAD_LABEL = 'Mark unread';

/**
 * Copy of the collapsed summary line's way out (design-canvas
 * `Main.dc.html`/`Anatomy.dc.html`). The collapsed cohort is the part of a
 * run the pane deliberately does not enumerate, so the line has to say where
 * the rest of it can be read.
 */
export const NOTIFICATION_DETAIL_SHOW_ALL_LABEL = 'show all in Downloads';

/**
 * Route the collapsed summary line navigates to. Not derived from the
 * record's `source`, because `internal/download/service_notification_rows.go`
 * is the only writer of `CollapsedCount` in the whole backend — a collapsed
 * row is a download run's, and no other producer can currently reach this
 * line to be sent somewhere wrong.
 */
export const NOTIFICATION_DETAIL_SHOW_ALL_ROUTE = '/downloads';
