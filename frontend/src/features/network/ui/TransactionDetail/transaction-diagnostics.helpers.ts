import type { CaptureDetail } from '../../../../shared/contracts/capture.types';
import {
  SYNC_DIAGNOSTICS_ROUTE,
  TRANSACTION_DIAGNOSTICS_NO_REPORT_NOTICE,
  TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE,
  TRANSACTION_REQUEST_BODY_OMITTED_STREAMING_NOTICE,
  TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE,
} from '../TransactionPanel/transaction-panel.constants';
import {
  TRANSACTION_DIAGNOSTICS_PREVIOUS_CYCLE_NONE,
  TRANSACTION_DIAGNOSTICS_UNPARSEABLE_BODY_NOTICE,
} from './transaction-diagnostics.constants';
import type { TransactionDiagnosticsReportViewModel, TransactionDiagnosticsRow } from './transaction-diagnostics.types';

/**
 * Reads a string member from a parsed JSON record, or `undefined` when the key
 * is absent or holds a non-string. The undefined case is load-bearing: an
 * absent field must stay absent in the projection, never become an empty
 * string or a placeholder.
 */
function readString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];

  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads a finite number member from a parsed JSON record, or `undefined` when
 * the key is absent or holds a non-number. `Number.isFinite` does not coerce
 * its argument, so it alone already rejects every non-number — no typeof
 * guard is needed. A present `0` is real data (a
 * cursor of 0 means no changelog entries exist yet) and must survive; only
 * genuine absence resolves to undefined.
 */
function readNumber(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];

  return Number.isFinite(value) ? (value as number) : undefined;
}

/**
 * Reads a plain-object member from a parsed JSON record, or `undefined` when
 * the member is absent or null. `null` counts as absent here: a nested
 * object this projection treats as a container (counters) carries no
 * information when it is null, and dereferencing null would throw. Nothing
 * else is defended, because nothing else is observable: the projection reads
 * only seven named string keys, so an array, a string or a number member
 * yields absent rows through the same field readers as any other non-record
 * value, and an absent key already resolves through every caller's presence
 * check. `typeof value === 'object'` was therefore dead code, not a guard.
 */
function readRecord(record: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> | undefined {
  const value = record[key];

  return value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

/**
 * Projects a present previous_cycle object into its labelled rows, in the
 * reading order the report is consumed in: outcome, elapsed milliseconds,
 * error fingerprint, error name. A member absent from the object produces no
 * row at all.
 */
function toPreviousCycleRows(previousCycle: Readonly<Record<string, unknown>>): readonly TransactionDiagnosticsRow[] {
  const rows: TransactionDiagnosticsRow[] = [];

  const outcome = readString(previousCycle, 'outcome');
  if (outcome !== undefined) {
    rows.push({ label: 'previous_cycle.outcome', value: outcome });
  }

  const elapsedMs = readNumber(previousCycle, 'elapsed_ms');
  if (elapsedMs !== undefined) {
    rows.push({ label: 'previous_cycle.elapsed_ms', value: `${elapsedMs}ms` });
  }

  const errorFingerprint = readString(previousCycle, 'error_fingerprint');
  if (errorFingerprint !== undefined) {
    rows.push({ label: 'previous_cycle.error_fingerprint', value: errorFingerprint });
  }

  const errorName = readString(previousCycle, 'error_name');
  if (errorName !== undefined) {
    rows.push({ label: 'previous_cycle.error_name', value: errorName });
  }

  return rows;
}

/**
 * Projects the identity members of a parsed report body into their labelled
 * rows: the cycle identifier, then the trigger source. A member absent from
 * the body produces no row at all.
 */
function toCycleRows(body: Readonly<Record<string, unknown>>): readonly TransactionDiagnosticsRow[] {
  const rows: TransactionDiagnosticsRow[] = [];

  const cycleId = readString(body, 'cycle_id');
  if (cycleId !== undefined) {
    rows.push({ label: 'cycle_id', value: cycleId });
  }

  const triggerSource = readString(body, 'trigger_source');
  if (triggerSource !== undefined) {
    rows.push({ label: 'trigger_source', value: triggerSource });
  }

  return rows;
}

/**
 * Projects the report body's counters container into its labelled rows, in
 * the order the report is consumed in: changelog cursor, consecutive
 * unclosed cycles, pending operations count. An absent or null counters
 * member produces no rows; a present `0` counter is real data and is
 * rendered.
 */
function toCountersRows(body: Readonly<Record<string, unknown>>): readonly TransactionDiagnosticsRow[] {
  const rows: TransactionDiagnosticsRow[] = [];

  const counters = readRecord(body, 'counters');
  if (counters !== undefined) {
    const cursor = readNumber(counters, 'cursor');
    if (cursor !== undefined) {
      rows.push({ label: 'cursor', value: String(cursor) });
    }

    const consecutiveUnclosedCycles = readNumber(counters, 'consecutive_unclosed_cycles');
    if (consecutiveUnclosedCycles !== undefined) {
      rows.push({ label: 'consecutive_unclosed_cycles', value: String(consecutiveUnclosedCycles) });
    }

    const pendingOpsCount = readNumber(counters, 'pending_ops_count');
    if (pendingOpsCount !== undefined) {
      rows.push({ label: 'pending_ops_count', value: String(pendingOpsCount) });
    }
  }

  return rows;
}

/**
 * Projects the report body's previous_cycle member into its labelled rows:
 * an explicit null is stated in words instead of implying an elapsed time or
 * an error, a present object delegates to {@link toPreviousCycleRows}, and an
 * absent member produces no row at all.
 */
function toPreviousCycleSectionRows(body: Readonly<Record<string, unknown>>): readonly TransactionDiagnosticsRow[] {
  const rows: TransactionDiagnosticsRow[] = [];

  if (body['previous_cycle'] === null) {
    rows.push({ label: 'previous_cycle', value: TRANSACTION_DIAGNOSTICS_PREVIOUS_CYCLE_NONE });
  } else {
    const previousCycle = readRecord(body, 'previous_cycle');
    if (previousCycle !== undefined) {
      rows.push(...toPreviousCycleRows(previousCycle));
    }
  }

  return rows;
}

/**
 * Projects one captured transaction's request body into the readable sync
 * diagnostics report, or `null` when the capture is not on the diagnostics
 * route at all. The projection is an additional reading of the same capture —
 * the raw JSON code block stays untouched beside it.
 *
 * The capture's body state is honoured before anything is parsed: a body the
 * capture layer skipped (pre-auth oversized or unknown-length rule) or never
 * recorded yields the no-report outcome with the already-declared wording,
 * never a projection of blanks that could read as zeroes. A present body
 * that cannot be parsed as JSON yields the unparseable-body notice; a body
 * that parses but is not a report object yields the no-report outcome, so
 * the two failure facts stay distinguishable. Inside a
 * report, a field absent from the payload produces no row; a present `0` is
 * real data and is rendered; an explicit `previous_cycle: null` is stated in
 * words instead of implying an elapsed time or an error.
 * @param capture The full capture detail DTO selected in the inspector.
 * @returns The projected report, the no-report outcome, or null off-route.
 */
export function toDiagnosticsReport(capture: Readonly<CaptureDetail>): TransactionDiagnosticsReportViewModel | null {
  if (capture.route !== SYNC_DIAGNOSTICS_ROUTE) {
    return null;
  }

  if (capture.requestBodyState === 'omitted_too_large') {
    return { kind: 'no-report', notice: TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE };
  }

  if (capture.requestBodyState === 'omitted_streaming') {
    return { kind: 'no-report', notice: TRANSACTION_REQUEST_BODY_OMITTED_STREAMING_NOTICE };
  }

  if (capture.requestBody === undefined || capture.requestBody === '') {
    return { kind: 'no-report', notice: TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(capture.requestBody);
  } catch {
    return { kind: 'no-report', notice: TRANSACTION_DIAGNOSTICS_UNPARSEABLE_BODY_NOTICE };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'no-report', notice: TRANSACTION_DIAGNOSTICS_NO_REPORT_NOTICE };
  }

  const body = parsed as Readonly<Record<string, unknown>>;
  const rows = [...toCycleRows(body), ...toCountersRows(body), ...toPreviousCycleSectionRows(body)];

  return { kind: 'report', rows };
}
