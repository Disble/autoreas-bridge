import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import { formatLocalDateTime } from '../../../../shared/datetime/datetime.helpers';
import { NOTIFICATION_TABLE_ROW_COUNT_SUFFIX, NOTIFICATION_TABLE_SUBJECT_SEPARATOR } from './notification-table.constants';

/**
 * Formats a notification row's `createdAtMs` as a local `YYYY-MM-DD
 * HH:MM:SS` label for the "When" column, reusing the shared datetime helper
 * by round-tripping through an ISO string (mirrors
 * `transaction-panel.helpers.ts`'s `formatCaptureTime`).
 */
export function formatNotificationWhen(createdAtMs: number): string {
  return formatLocalDateTime(new Date(createdAtMs).toISOString());
}

/**
 * The subjects a row can actually put on screen: the bounded excerpt the
 * backend sent, minus any empty name. Blank names are dropped rather than
 * rendered as a stray separator, and a row left with none of them is treated
 * as naming nothing at all.
 */
function namedSubjects(row: Readonly<NotificationRow>): readonly string[] {
  return (row.subjects ?? []).filter((subject) => subject !== '');
}

/**
 * Whether a row has never been read. `readAtMs` is `omitempty` on the wire, so
 * an unread record arrives with the key absent; the explicit zero branch covers
 * any producer that sends the zero value rather than omitting it, which would
 * otherwise read as "read at the epoch".
 */
export function isNotificationRowUnread(row: Readonly<NotificationRow>): boolean {
  return (row.readAtMs ?? 0) === 0;
}

/**
 * Joins a row's bounded subject excerpt into the line naming WHICH things the
 * record is about -- the master list's answer to the Anatomy artboard's
 * argument that "a count answers 'how many'. Nobody asks that."
 *
 * Returns `undefined` rather than an empty string when a record names nothing,
 * so the row renders no second line at all instead of an empty one.
 */
export function formatNotificationSubjects(row: Readonly<NotificationRow>): string | undefined {
  const named = namedSubjects(row);
  if (named.length === 0) {
    return undefined;
  }
  return named.join(NOTIFICATION_TABLE_SUBJECT_SEPARATOR);
}

/**
 * Formats the "3x" count badge, or `undefined` when the row should carry none.
 *
 * The badge appears exactly when the subject line does not already name every
 * thing the record stands for. That is the whole point of it: a record whose
 * two named subjects ARE its two things gains nothing from a "2x" beside them,
 * while a record standing for three things under two names -- or for several
 * things it can name none of -- carries information the subject line could
 * not. `rowCount` counts THINGS, not detail rows (a collapsed summary row
 * contributes the number it stands in for), so "3x" always means three anime.
 */
export function formatNotificationRowCount(row: Readonly<NotificationRow>): string | undefined {
  const total = row.rowCount ?? 0;
  if (total <= 1 || total <= namedSubjects(row).length) {
    return undefined;
  }
  return `${total}${NOTIFICATION_TABLE_ROW_COUNT_SUFFIX}`;
}
