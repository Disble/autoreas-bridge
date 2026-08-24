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

/** Deduplication key for the missed-schedule decision toast. */
export const MISSED_DECISION_TOAST_ID = 'missed-schedule-decision';

/** Deduplication key for the missed-schedule failure toast. */
export const MISSED_FAILURE_TOAST_ID = 'missed-schedule-failure';

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
