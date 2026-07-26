import type { CaptureDetail, CaptureRow } from '../../../../shared/contracts/capture.types';
import { formatLocalTime } from '../../../../shared/datetime/datetime.helpers';
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

/** Formats the DURATION column in milliseconds, or the Null Object em-dash when absent. */
function formatTransactionDuration(durationMs: number | undefined): string {
  return durationMs === undefined ? TRANSACTION_EMPTY_LABEL : `${durationMs}ms`;
}

/** Resolves whether a row is truly in flight, excluding terminal captures that still carry a legacy pending outcome token. */
function isInFlightCapture(outcome: string, httpStatus: number | undefined, durationMs: number | undefined): boolean {
  return outcome === 'pending' && httpStatus === undefined && durationMs === undefined;
}

/** Normalizes a transport-only terminal capture so completed HTTP rows never keep the legacy pending label. */
function normalizeTransactionOutcome(outcome: string, httpStatus: number | undefined, durationMs: number | undefined): string {
  if (isInFlightCapture(outcome, httpStatus, durationMs)) {
    return outcome;
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
  const isPending = isInFlightCapture(row.outcome, row.httpStatus, row.durationMs);
  const outcome = normalizeTransactionOutcome(row.outcome, row.httpStatus, row.durationMs);

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
export function toTransactionDetail(detail: Readonly<CaptureDetail>): TransactionDetailViewModel {
  const outcome = normalizeTransactionOutcome(detail.outcome, detail.httpStatus, detail.durationMs);

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
