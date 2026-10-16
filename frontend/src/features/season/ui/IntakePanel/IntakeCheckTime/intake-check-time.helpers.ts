import { Time } from '@internationalized/date';
import { toErrorMessage } from '../../../../../shared/helpers/error-message.helpers';
import { CHECK_TIME_EMPTY_MESSAGE, CHECK_TIME_PATTERN, CHECK_TIME_SAVE_FAILED_MESSAGE } from './intake-check-time.constants';
import type { CheckTimeDraft, CheckTimePort, CheckTimeSaveResult } from './intake-check-time.types';

/**
 * Parses a stored HH:MM into the time field's value.
 * @param hhmm The stored time.
 * @returns The time value, or `null` when `hhmm` is not a zero-padded 24-hour HH:MM.
 */
export function toCheckTimeValue(hhmm: string): Time | null {
  const match = CHECK_TIME_PATTERN.exec(hhmm);
  if (match === null) {
    return null;
  }
  return new Time(Number(match[1]), Number(match[2]));
}

/**
 * Renders a time field value as the zero-padded HH:MM the backend accepts.
 * @param value The time field value.
 * @returns The HH:MM string.
 */
export function formatCheckTime(value: Pick<Time, 'hour' | 'minute'>): string {
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}

/**
 * Reads the daily check time, treating an unavailable runtime, a rejected read
 * and a malformed value alike as "unknown" so the control stays hidden.
 * @param port The check time port.
 * @returns The stored HH:MM, or `null` when it cannot be shown.
 */
export async function readCheckTime(port: Pick<CheckTimePort, 'getCheckTime'>): Promise<string | null> {
  try {
    const hhmm = await port.getCheckTime();
    return toCheckTimeValue(hhmm) === null ? null : hhmm;
  } catch {
    return null;
  }
}

/**
 * Saves the field's time, refusing an incomplete field without a backend call.
 * @param port The check time port.
 * @param value The time field value.
 * @returns The saved HH:MM, or the message explaining why nothing was saved.
 */
export async function saveCheckTime(port: Pick<CheckTimePort, 'setCheckTime'>, value: CheckTimeDraft): Promise<CheckTimeSaveResult> {
  if (value === null) {
    return { ok: false, message: CHECK_TIME_EMPTY_MESSAGE };
  }
  const time = formatCheckTime(value);
  try {
    const status = await port.setCheckTime(time);
    return status === 'ok' ? { ok: true, time } : { ok: false, message: status };
  } catch (error) {
    return { ok: false, message: toErrorMessage(error, CHECK_TIME_SAVE_FAILED_MESSAGE) };
  }
}
