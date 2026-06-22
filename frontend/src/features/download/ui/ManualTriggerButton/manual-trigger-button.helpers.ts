import type { ManualTriggerResult } from './manual-trigger-button.types';

const ALREADY_IN_PROGRESS_MESSAGE = 'schedule: a download run is already in progress';

/**
 * Maps `TriggerDownloadCheck`'s raw response string to a typed result.
 * `"ok"` is success; the scheduler's concurrent-run-guard message maps to
 * `"already-in-progress"`; any other non-"ok" string is a generic error
 * carrying the backend's message verbatim.
 */
export function toManualTriggerResult(response: string): ManualTriggerResult {
  if (response === 'ok') {
    return { status: 'success' };
  }

  if (response === ALREADY_IN_PROGRESS_MESSAGE) {
    return { status: 'already-in-progress' };
  }

  return { status: 'error', errorMessage: response };
}
