import type { CaptureDetail, CaptureRow } from '../../../../shared/contracts/capture.types';
import { formatLocalTime } from '../../../../shared/datetime/datetime.helpers';
import { isStalePendingCapture } from '../../../../shared/store/transaction-store/transaction-store.helpers';
import {
  TRANSACTION_EMPTY_LABEL,
  TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE,
  TRANSACTION_REQUEST_BODY_OMITTED_STREAMING_NOTICE,
  TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE,
  TRANSACTION_RESPONSE_NOT_CAPTURED_NOTICE,
  TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE,
} from './transaction-panel.constants';
import type {
  HeroChipColor,
  TransactionBodySource,
  TransactionBodyViewModel,
  TransactionDetailFieldRow,
  TransactionDetailViewModel,
  TransactionRowViewModel,
} from './transaction-panel.types';

/**
 * Formats an epoch-millis capture timestamp as a local-timezone `HH:MM:SS`,
 * reusing the shared datetime helper by round-tripping through an ISO string.
 */
function formatCaptureTime(capturedAtMs: number): string {
  return formatLocalTime(new Date(capturedAtMs).toISOString());
}

/**
 * Maps an HTTP status code to the project's semantic HeroUI chip color by
 * status class. An absent status renders as neutral (default).
 */
export function getTransactionStatusColor(httpStatus: number | undefined): HeroChipColor {
  if (httpStatus === undefined) {
    return 'default';
  }

  const statusClass = Math.floor(httpStatus / 100);

  switch (statusClass) {
    case 2:
      return 'success';
    case 4:
      return 'danger';
    case 5:
      return 'danger';
    default:
      return 'default';
  }
}

/**
 * Maps a capture outcome to the project's semantic HeroUI chip color over
 * the real capture vocabulary (design.md "Outcome vocabulary — the
 * evidence", grepped from `sync_handler.go` / `anime_handler.go` /
 * `websocket_handler.go` / `realtime/hub_capture.go`). There is no `stale`
 * outcome — that token belongs to a different entity (device-sync status)
 * and MUST NOT be mixed in here. Any value outside the known vocabulary
 * renders with the neutral/default token rather than being dropped or
 * hidden.
 */
export function getTransactionOutcomeColor(outcome: string): HeroChipColor {
  switch (outcome) {
    case 'accepted':
    case 'pushed':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'malformed':
      return 'warning';
    // A stranded arrival row: the bridge never recorded how this request ended.
    // Warning, not default -- it is missing evidence, not an ordinary outcome.
    case 'abandoned':
      return 'warning';
    case 'pending':
    case 'opened':
      return 'accent';
    case 'closed':
      return 'default';
    default:
      return 'default';
  }
}

/** Formats the STATUS column, or the Null Object em-dash when absent. */
function formatTransactionStatusLabel(httpStatus: number | undefined): string {
  return httpStatus === undefined ? TRANSACTION_EMPTY_LABEL : String(httpStatus);
}

/**
 * Builds a body/payload pane's view-model, distinguishing captured, never-
 * captured, omitted, and truncated content rather than conflating them into
 * one placeholder string. Any non-empty captureState is rendered with an
 * explicit notice so Activity never presents an incomplete body as exact.
 */
export function toTransactionBody(source: Readonly<TransactionBodySource>): TransactionBodyViewModel {
  if (source.kind === 'request') {
    if (source.captureState === 'omitted_too_large') {
      return { state: 'redacted', raw: '', notice: TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE };
    }

    if (source.captureState === 'omitted_streaming') {
      return { state: 'redacted', raw: '', notice: TRANSACTION_REQUEST_BODY_OMITTED_STREAMING_NOTICE };
    }

    if (source.raw === undefined || source.raw === '') {
      return { state: 'not-captured', raw: '', notice: TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE };
    }

    return { state: 'captured', raw: source.raw };
  }

  if (source.raw === undefined) {
    return { state: 'not-captured', raw: '', notice: TRANSACTION_RESPONSE_NOT_CAPTURED_NOTICE };
  }

  if (source.captureState === 'truncated') {
    return { state: 'redacted', raw: source.raw, notice: TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE };
  }

  return { state: 'captured', raw: source.raw };
}

/**
 * Formats the DURATION column, or the Null Object em-dash when absent. Raw
 * milliseconds stay exact below a second, where they are the useful unit;
 * above that the value is scaled so a long request reads as "52.6s" or
 * "13h 43m" rather than an unparseable millisecond count.
 */
function formatTransactionDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return TRANSACTION_EMPTY_LABEL;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  if (durationMs < 3_600_000) {
    return `${Math.floor(durationMs / 60_000)}m ${Math.floor((durationMs % 60_000) / 1000)}s`;
  }

  return `${Math.floor(durationMs / 3_600_000)}h ${Math.floor((durationMs % 3_600_000) / 60_000)}m`;
}

/**
 * Reports whether a row is still in its transport-only arrival shape: the
 * pending outcome the capture middleware writes before a handler runs, with
 * neither of the terminal columns filled in. A terminal capture that still
 * carries the legacy pending token is excluded.
 */
function isTransportOnlyArrival(outcome: string, httpStatus: number | undefined, durationMs: number | undefined): boolean {
  return outcome === 'pending' && httpStatus === undefined && durationMs === undefined;
}

/**
 * Resolves whether a row is truly in flight. An arrival row that has aged past
 * the staleness window is NOT in flight: its terminal write is never coming, so
 * continuing to tick would present a dead request as live.
 */
function isInFlightCapture(row: Readonly<CaptureRow>, now: number): boolean {
  return isTransportOnlyArrival(row.outcome, row.httpStatus, row.durationMs) && !isStalePendingCapture(row.capturedAtMs, now);
}

/**
 * Normalizes a capture's outcome for display: a terminal row never keeps the
 * legacy pending token, and a stranded arrival row is reported as `abandoned`
 * rather than pretending to still be in flight.
 */
function normalizeTransactionOutcome(outcome: string, httpStatus: number | undefined, durationMs: number | undefined, isInFlight: boolean): string {
  if (isInFlight) {
    return outcome;
  }

  if (isTransportOnlyArrival(outcome, httpStatus, durationMs)) {
    return 'abandoned';
  }

  if (outcome === 'pending') {
    return 'completed';
  }

  return outcome;
}

/**
 * Maps one captured transaction row (DTO) into the table's per-row
 * view-model. A pending (in-flight) row shows a live-ticking elapsed
 * duration (`now - capturedAtMs`) instead of the empty label, driven by the
 * caller's shared elapsed clock (`now`, defaults to the render time so
 * non-live callers keep working unchanged).
 */
export function toTransactionRow(row: Readonly<CaptureRow>, now: number = Date.now()): TransactionRowViewModel {
  const isPending = isInFlightCapture(row, now);
  const outcome = normalizeTransactionOutcome(row.outcome, row.httpStatus, row.durationMs, isPending);

  return {
    id: row.requestId,
    methodKind: row.kind,
    route: row.route,
    outcome,
    outcomeColor: getTransactionOutcomeColor(outcome),
    statusLabel: formatTransactionStatusLabel(row.httpStatus),
    statusColor: getTransactionStatusColor(row.httpStatus),
    hasHttpStatus: row.httpStatus !== undefined,
    durationLabel: formatTransactionDuration(isPending ? Math.max(now - row.capturedAtMs, 0) : row.durationMs),
    timeLabel: formatCaptureTime(row.capturedAtMs),
    isPending,
  };
}

/** Maps a header map into sorted label/value rows, or an empty array when absent. */
function toHeaderRows(headers: Readonly<Record<string, string>> | undefined): readonly TransactionDetailFieldRow[] {
  if (headers === undefined) {
    return [];
  }

  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({ label, value }));
}

/** Builds the General tab's label/value field rows. */
function toGeneralFields(detail: Readonly<CaptureDetail>): readonly TransactionDetailFieldRow[] {
  return [
    { label: 'requestId', value: detail.requestId },
    { label: 'transport', value: detail.transport },
    { label: 'deviceName', value: detail.deviceName },
    { label: 'errorCode', value: detail.errorCode === undefined || detail.errorCode === '' ? TRANSACTION_EMPTY_LABEL : detail.errorCode },
  ];
}

/**
 * Maps the correlated operation refs into label/value rows: `"animeId ·
 * operation"` -> outcome. Returns an empty array when there are none.
 */
function toCorrelationRows(detail: Readonly<CaptureDetail>): readonly TransactionDetailFieldRow[] {
  return detail.correlations.operationRefs.map((ref) => ({
    label: `${ref.animeId} · ${ref.operation}`,
    value: ref.outcome,
  }));
}

/**
 * Maps one captured transaction detail (DTO) into the inspector's tabbed
 * view-model: General fields, Request headers/payload, Response
 * body/headers, and correlations. Missing optional telemetry falls back to
 * explicit absent-body notices rather than a blank or fabricated value.
 */
export function toTransactionDetail(detail: Readonly<CaptureDetail>, now: number = Date.now()): TransactionDetailViewModel {
  const outcome = normalizeTransactionOutcome(detail.outcome, detail.httpStatus, detail.durationMs, isInFlightCapture(detail, now));

  return {
    requestId: detail.requestId,
    methodKind: detail.kind,
    route: detail.route,
    outcome,
    outcomeColor: getTransactionOutcomeColor(outcome),
    statusLabel: formatTransactionStatusLabel(detail.httpStatus),
    statusColor: getTransactionStatusColor(detail.httpStatus),
    hasHttpStatus: detail.httpStatus !== undefined,
    durationLabel: formatTransactionDuration(detail.durationMs),
    timeLabel: formatCaptureTime(detail.capturedAtMs),
    deviceName: detail.deviceName,
    errorCode: detail.errorCode ?? '',
    generalFields: toGeneralFields(detail),
    requestHeaders: toHeaderRows(detail.requestHeaders),
    responseHeaders: toHeaderRows(detail.responseHeaders),
    requestPayload: toTransactionBody({ kind: 'request', raw: detail.requestBody, captureState: detail.requestBodyState }),
    responseBody: toTransactionBody({ kind: 'response', raw: detail.responseBody, captureState: detail.responseBodyState }),
    correlations: toCorrelationRows(detail),
  };
}
