import type { CaptureDetail, CaptureRow } from '../../../../shared/contracts/capture.types';
import { formatLocalTime } from '../../../../shared/datetime/datetime.helpers';
import { TRANSACTION_EMPTY_LABEL, TRANSACTION_NOT_CAPTURED_LABEL } from './transaction-panel.constants';
import type {
  HeroChipColor,
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
 * status class (design.md "statusColor(class 2xx/3xx/4xx/5xx -> success/
 * default/warning/danger)"). An absent status renders as neutral (default).
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
      return 'warning';
    case 5:
      return 'danger';
    default:
      return 'default';
  }
}

/** Formats the STATUS column, or the Null Object em-dash when absent. */
function formatTransactionStatusLabel(httpStatus: number | undefined): string {
  return httpStatus === undefined ? TRANSACTION_EMPTY_LABEL : String(httpStatus);
}

/** Formats the DURATION column in milliseconds, or the Null Object em-dash when absent. */
function formatTransactionDuration(durationMs: number | undefined): string {
  return durationMs === undefined ? TRANSACTION_EMPTY_LABEL : `${durationMs}ms`;
}

/**
 * Maps one captured transaction row (DTO) into the table's per-row
 * view-model.
 */
export function toTransactionRow(row: Readonly<CaptureRow>): TransactionRowViewModel {
  return {
    id: row.requestId,
    methodKind: row.kind,
    route: row.route,
    outcome: row.outcome,
    statusLabel: formatTransactionStatusLabel(row.httpStatus),
    statusColor: getTransactionStatusColor(row.httpStatus),
    durationLabel: formatTransactionDuration(row.durationMs),
    timeLabel: formatCaptureTime(row.capturedAtMs),
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
 * "Not captured" rather than a blank or fabricated value.
 */
export function toTransactionDetail(detail: Readonly<CaptureDetail>): TransactionDetailViewModel {
  return {
    requestId: detail.requestId,
    methodKind: detail.kind,
    route: detail.route,
    outcome: detail.outcome,
    statusLabel: formatTransactionStatusLabel(detail.httpStatus),
    statusColor: getTransactionStatusColor(detail.httpStatus),
    durationLabel: formatTransactionDuration(detail.durationMs),
    timeLabel: formatCaptureTime(detail.capturedAtMs),
    deviceName: detail.deviceName,
    errorCode: detail.errorCode ?? '',
    generalFields: toGeneralFields(detail),
    requestHeaders: toHeaderRows(detail.requestHeaders),
    responseHeaders: toHeaderRows(detail.responseHeaders),
    requestPayload: JSON.stringify(detail.payload, null, 2),
    responseBody: detail.responseBody ?? TRANSACTION_NOT_CAPTURED_LABEL,
    correlations: toCorrelationRows(detail),
  };
}
