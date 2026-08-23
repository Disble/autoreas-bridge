import { formatLocalDateTime } from '../../../../shared/datetime/datetime.helpers';

/**
 * Formats a notification row's `createdAtMs` as a local `YYYY-MM-DD
 * HH:MM:SS` label for the "When" column, reusing the shared datetime helper
 * by round-tripping through an ISO string (mirrors
 * `transaction-panel.helpers.ts`'s `formatCaptureTime`).
 */
export function formatNotificationWhen(createdAtMs: number): string {
  return formatLocalDateTime(new Date(createdAtMs).toISOString());
}
