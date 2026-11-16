import type { ScheduleMissedActionResult, ScheduleMissedNotice } from '../../contracts/download.types';

/** Selects a notice when its date has the requested relationship to the marker. */
export function selectMissedNotice(notice: ScheduleMissedNotice | undefined, marker: string | undefined, matching: boolean): ScheduleMissedNotice | undefined {
  if (notice === undefined || (notice.localDate === marker) !== matching) return undefined;
  return notice;
}

/** Decides whether an action result needs the schedule re-read. */
export function shouldRefreshMissedResult(kind: ScheduleMissedActionResult['kind'], runNow: boolean): boolean {
  return kind === 'settled' || kind === 'already_resolved' || kind === 'not_available' || (runNow && kind === 'unresolved_terminal');
}

/** Decides which renderer-session markers no longer match the backend notice. */
export function missedNoticeReset(date: string | undefined, hidden: string | undefined, failed: string | undefined) {
  return {
    restore: date === undefined || (hidden !== undefined && hidden !== date),
    clear: date === undefined || (failed !== undefined && failed !== date),
  };
}

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
