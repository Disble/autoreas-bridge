import type { AppNotificationSeverity } from '../../../../shared/contracts/app-notification.types';

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
