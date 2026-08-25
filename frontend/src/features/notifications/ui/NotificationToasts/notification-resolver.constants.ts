import type { AppNotificationSeverity } from '../../../../shared/contracts/app-notification.types';
import type { AppToastVariant } from './app-notification.types';

/**
 * Maps backend notification `Level` strings to the unified `AppNotificationSeverity`.
 */
export const LEVEL_TO_SEVERITY: Record<string, AppNotificationSeverity> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  success: 'success',
};

/** Label for the toast action that opens a toast's persisted Center record (Task-Planning Note C). */
export const VIEW_DETAILS_ACTION_LABEL = 'View details';

/** Deduplication key for the missed-schedule decision toast. */
export const MISSED_DECISION_TOAST_ID = 'missed-schedule-decision';

/** Deduplication key for the missed-schedule failure toast. */
export const MISSED_FAILURE_TOAST_ID = 'missed-schedule-failure';

/**
 * Backend notification kinds a dedicated resolver already renders, which
 * `useBackendEventResolver` therefore must not render a second time.
 *
 * `missed_schedule` is raised by the Go producer so it becomes a durable
 * Center record instead of a toast that cannot be found again — but the
 * toast for it stays with `useMissedScheduleResolver`, because that toast is
 * PERSISTENT: it stays on screen until the day is settled, and a decision the
 * user has not made yet must not expire on a four-second timer.
 *
 * That is now the whole reason. This comment used to give two more — that the
 * `notification.push` payload carried actions without the persisted ids a
 * press needs, and that `RecordID` was never populated — and both stopped
 * being true when the delivery envelope started carrying identity
 * (docs/adr/016-notification-adapters-project-not-truncate.md). The generic
 * path could render pressable buttons for this kind today; what it still
 * cannot do is keep them on screen until they are answered.
 *
 * This is a set of kinds rather than a hardcoded branch so the next
 * dedicated resolver is one entry, not another `if`.
 */
export const KINDS_OWNED_BY_A_DEDICATED_RESOLVER: ReadonlySet<string> = new Set(['missed_schedule']);

/**
 * Maps each `AppNotificationSeverity` to the HeroUI toast variant it renders
 * as. Pinned by `app-toast-queue.test.ts` against the four convenience
 * methods (`toast.success/warning/danger/info`) the app-owned queue
 * replaces -- `info` maps to `'accent'`, matching `toast.info`'s own
 * variant, not a literal `'info'` (HeroUI's variant union has no such
 * member).
 */
export const SEVERITY_TO_VARIANT: Record<AppNotificationSeverity, AppToastVariant> = {
  info: 'accent',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

/**
 * Default auto-dismiss timeout (ms) applied to a non-persistent toast.
 * Mirrors HeroUI's own `DEFAULT_TOAST_TIMEOUT` (verified in the installed
 * `@heroui/react` 3.2.4 dist source, `toast-queue.js`) so the app-owned
 * queue keeps the exact same default once it stops going through the
 * `toast.*` singleton wrapper.
 */
export const DEFAULT_TOAST_TIMEOUT_MS = 4000;

/**
 * How many rows a toast names before the rest collapse into a "+N more" line.
 *
 * Far below the Center's own 50: a toast is a glance, and a run that touched
 * nine anime must not become a nine-row card that outlives its own timeout on
 * screen. The Center record carries all of them.
 */
export const NOTIFICATION_TOAST_ROWS_LIMIT = 3;

/** Test id for the toast's row block. */
export const NOTIFICATION_TOAST_ROWS_TESTID = 'notification-toast-rows';

/** Test id for the toast's footer action row. */
export const NOTIFICATION_TOAST_ACTIONS_TESTID = 'notification-toast-actions';
