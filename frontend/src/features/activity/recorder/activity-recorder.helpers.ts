import type { ActivityRecorderEntry } from '../activity-source/activity.types';
import {
  ACTIVITY_RECORDER_ABANDONED_OUTCOME,
  ACTIVITY_RECORDER_CLIENT_ERROR_STATUS,
  ACTIVITY_RECORDER_LEVEL_COLOR,
  ACTIVITY_RECORDER_PENDING_OUTCOME,
  ACTIVITY_RECORDER_SERVER_ERROR_STATUS,
  ACTIVITY_RECORDER_TIME_FORMAT,
} from './activity-recorder.constants';
import type { ActivityRecorderLineModel, ActivityRecorderRow, ActivityRecorderStatusColor } from './activity-recorder.types';

/**
 * Keys one recorder row. A request is emitted twice under the same id, so
 * its key is its id; a live event carries no id, so its key is unique per push.
 *
 * @param entry The recorder row.
 * @param sequence A number unique to this push, used only when the row has no id.
 * @returns The keyed row.
 */
export function toRecorderRow(entry: ActivityRecorderEntry, sequence: number): ActivityRecorderRow {
  const key = entry.id === '' ? `${entry.source}:live:${sequence}` : `${entry.source}:${entry.id}`;
  return { key, entry };
}

/** Whether a row is past its pending emit. */
function isTerminal(entry: ActivityRecorderEntry): boolean {
  return entry.outcome !== ACTIVITY_RECORDER_PENDING_OUTCOME;
}

/**
 * Applies one live row: a row already on screen is replaced in place, unless
 * a late pending emit would overwrite its terminal state; a new row is
 * prepended. The result never holds more than `cap` rows, dropping the oldest.
 *
 * @param rows The rows on screen, newest first.
 * @param row The live row.
 * @param cap The most rows to keep.
 * @returns The next rows.
 */
export function upsertRecorderRow(rows: readonly ActivityRecorderRow[], row: ActivityRecorderRow, cap: number): readonly ActivityRecorderRow[] {
  const index = rows.findIndex((shown) => shown.key === row.key);
  if (index === -1) {
    return [row, ...rows].slice(0, cap);
  }
  if (isTerminal(rows[index].entry) && !isTerminal(row.entry)) {
    return rows;
  }
  return rows.map((shown, position) => (position === index ? row : shown));
}

/**
 * Appends an older page after the rows on screen, skipping rows already shown,
 * never growing past `cap`. Page rows always carry an id.
 *
 * @param rows The rows on screen, newest first.
 * @param entries The older page, newest first.
 * @param cap The most rows to keep.
 * @returns The next rows.
 */
export function appendOlderRecorderRows(
  rows: readonly ActivityRecorderRow[],
  entries: readonly ActivityRecorderEntry[],
  cap: number,
): readonly ActivityRecorderRow[] {
  const shownKeys = new Set(rows.map((row) => row.key));
  const older = entries.map((entry) => toRecorderRow(entry, 0)).filter((row) => !shownKeys.has(row.key));
  return [...rows, ...older].slice(0, cap);
}

/**
 * Whether an older page may be read: a cursor remains, the list is under its
 * cap, and no read is in flight.
 *
 * @param cursor The next page cursor; empty when none remains.
 * @param rowCount The rows held.
 * @param isLoading Whether a page read is in flight.
 * @param cap The most rows to keep.
 * @returns True when the next page should be read.
 */
export function canLoadOlderRecorderRows(cursor: string, rowCount: number, isLoading: boolean, cap: number): boolean {
  return cursor !== '' && rowCount < cap && !isLoading;
}

/** Chip color of a request: a 5xx is danger, a 4xx or an abandoned request warning, the rest calm. */
function requestColor(entry: ActivityRecorderEntry): ActivityRecorderStatusColor {
  const status = entry.httpStatus ?? 0;
  if (status >= ACTIVITY_RECORDER_SERVER_ERROR_STATUS) {
    return 'danger';
  }
  if (status >= ACTIVITY_RECORDER_CLIENT_ERROR_STATUS || entry.outcome === ACTIVITY_RECORDER_ABANDONED_OUTCOME) {
    return 'warning';
  }
  return 'default';
}

/** Joins the recorded facts, skipping the empty ones. */
function joinDetail(parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(' · ');
}

/** `41 ms`, or empty when no duration was recorded. */
function formatDuration(durationMs: number | undefined): string {
  return durationMs === undefined ? '' : `${durationMs} ms`;
}

/**
 * Words one recorder row for the list: a request by its route and answer, an
 * event by its message and level.
 *
 * @param row The keyed recorder row.
 * @returns The line the list renders.
 */
export function toRecorderLineModel(row: ActivityRecorderRow): ActivityRecorderLineModel {
  const { entry } = row;
  const time = ACTIVITY_RECORDER_TIME_FORMAT.format(entry.atMs);
  if (entry.source === 'request') {
    return {
      key: row.key,
      time,
      title: entry.route === '' ? entry.kind : entry.route,
      detail: joinDetail([entry.deviceName, formatDuration(entry.durationMs), entry.errorCode]),
      statusLabel: entry.httpStatus === undefined ? entry.outcome : String(entry.httpStatus),
      statusColor: requestColor(entry),
    };
  }
  return {
    key: row.key,
    time,
    title: entry.message === '' ? entry.eventType : entry.message,
    detail: joinDetail([entry.domain, entry.eventType, formatDuration(entry.durationMs)]),
    statusLabel: entry.level,
    statusColor: ACTIVITY_RECORDER_LEVEL_COLOR[entry.level] ?? 'default',
  };
}
