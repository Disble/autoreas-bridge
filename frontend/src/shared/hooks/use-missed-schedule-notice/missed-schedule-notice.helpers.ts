import type { ScheduleMissedActionResult, ScheduleMissedNotice } from '../../contracts/download.types';

/** Formats a backend missed-notice due timestamp for dumb UI consumers. */
export function formatMissedScheduleDueLabel(notice: ScheduleMissedNotice): string {
  return new Date(notice.dueAtMs).toLocaleString();
}

/** Formats a scheduler-owned missed-notice action result into safe user-facing feedback. */
export function formatMissedScheduleActionMessage(result: ScheduleMissedActionResult): string | undefined {
  switch (result.kind) {
    case 'unresolved_terminal':
      return `Run now finished with ${result.terminalStatus ?? 'error'}. The notice remains active.`;
    case 'run_in_progress':
      return result.message || 'A download run is already in progress.';
    case 'error':
      return result.message || 'Failed to resolve the missed schedule notice.';
    case 'already_resolved':
      return 'The missed schedule notice was already resolved.';
    case 'not_available':
      return 'The missed schedule notice is no longer available.';
    default:
      return undefined;
  }
}
