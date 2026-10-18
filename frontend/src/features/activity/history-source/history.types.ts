import type { ActivityRecorderEntry } from '../activity-source/activity.types';

/**
 * Frontend contracts of the History and recorder reads (`internal/observability/activityread`).
 *
 * They mirror the Go types field for field, renamed to camelCase and made
 * readonly. Nil pointers become `undefined` and nil slices become empty arrays.
 */

/** The "where it happened" filter, the Go `Where` values. */
export type ActivityWhere = 'all' | 'phone' | 'downloads' | 'editor' | 'schedule' | 'season';

/** A chip Go put on a ledger line. Unknown marks are dropped at the boundary. */
export type ActivityLineMark = 'recovered' | 'arrived_late' | 'incident';

/** One square of the 90-day calendar. `hasData` false is a gap, never a quiet day. */
export interface ActivityCalendarDay {
  /** Local midnight of the day, epoch milliseconds. */
  readonly dayStartMs: number;
  /** Requests answered that day, from the hourly rollup. */
  readonly total: number;
  /** Whether the rollup holds any row for the day. */
  readonly hasData: boolean;
  /** Whether an incident occurred that day. */
  readonly hasIncident: boolean;
}

/** One fact in History. Fields a kind does not use stay empty. */
export interface ActivityLedgerLine {
  /** Source of the fact: `change`, `phone_report`, `connection`, `event`, `incident`. */
  readonly kind: string;
  /** Row id within its kind. */
  readonly id: string;
  /** Bridge time, epoch milliseconds. */
  readonly atMs: number;
  /** Phone time, when the phone reported one. */
  readonly phoneAtMs: number | undefined;
  /** Domain of the fact, when recorded. */
  readonly domain: string;
  /** Who produced it, when recorded. */
  readonly source: string;
  /** Event level, when the fact is an event. */
  readonly level: string;
  /** Plain-words title worded by Go. */
  readonly title: string;
  /** Secondary detail worded by Go. */
  readonly detail: string;
  /** Correlation id, when recorded. */
  readonly correlationId: string;
  /** Chips Go put on the line. */
  readonly marks: readonly ActivityLineMark[];
}

/** One local day's lines, newest first. */
export interface ActivityLedgerDay {
  /** Local midnight of the day, epoch milliseconds. */
  readonly dayStartMs: number;
  /** The day's facts, newest first. */
  readonly lines: readonly ActivityLedgerLine[];
}

/** One History page. The calendar is filled on the first page only. */
export interface ActivityHistoryView {
  /** The 90 calendar squares, oldest first; empty after the first page. */
  readonly calendar: readonly ActivityCalendarDay[];
  /** Day groups, newest first. */
  readonly days: readonly ActivityLedgerDay[];
  /** Cursor of the next older page; empty when none remains. */
  readonly nextCursor: string;
}

/** One recorder page, newest first. */
export interface ActivityRecorderPage {
  /** Rows of the page, unknown sources skipped. */
  readonly entries: readonly ActivityRecorderEntry[];
  /** Cursor of the next older page; empty when none remains. */
  readonly nextCursor: string;
}
