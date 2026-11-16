/**
 * Frontend contract of one ledger line (`internal/observability/activityread`),
 * the shape the feed source reads.
 *
 * It mirrors the Go type field for field, renamed to camelCase and made
 * readonly. Nil pointers become `undefined` and nil slices become empty arrays.
 */

/** A chip Go put on a ledger line. Unknown marks are dropped at the boundary. */
export type ActivityLineMark = 'recovered' | 'arrived_late' | 'incident';

/** One recorded fact. Fields a kind does not use stay empty. */
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
  /** Secondary detail worded by Go; for a change, its action type, which the UI words. */
  readonly detail: string;
  /** Correlation id, when recorded. */
  readonly correlationId: string;
  /** A change's snapshot JSON before the write; empty for other kinds. */
  readonly beforeJson: string;
  /** A change's snapshot JSON after the write; empty for other kinds. */
  readonly afterJson: string;
  /** Chips Go put on the line. */
  readonly marks: readonly ActivityLineMark[];
}
