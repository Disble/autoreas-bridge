import {
  GetCaptureTransaction,
  ListCaptureTransactions,
  SummarizeCaptureTransactions,
} from '../../../wailsjs/go/main/App';
import type {
  CaptureDetailResult,
  CapturePage,
  CaptureQueryFilters,
  CaptureSummary,
  CaptureSummaryFilters,
} from '../../shared/contracts/capture.types';
import { hasGoBinding, invokeGoBinding } from '../wails-bindings.helpers';
import {
  CAPTURE_TRANSACTION_SOURCE_STATE,
  DEGRADED_CAPTURE_DETAIL_RESULT,
  DEGRADED_CAPTURE_SUMMARY,
  DEGRADED_EMPTY_CAPTURE_PAGE,
} from './capture-transaction-source.constants';
import type { CaptureTransactionSource } from './capture-transaction-source.types';

/**
 * Maps the app-facing (camelCase) filter shape into the Wails binding's wire
 * request. `contracts.CaptureQuery` carries no JSON tags, so the Go bound
 * method expects the raw (PascalCase) struct field names verbatim.
 *
 * The pointer-typed fields (`HTTPStatus`, `StartMS`, `EndMS`, `ChangelogID`)
 * are forwarded as-is and MUST NOT be defaulted: Go reads an absent value as a
 * nil pointer and adds no predicate, while a defaulted 0 would become a real
 * `http_status = 0` / `changelog id 0` filter matching nothing.
 */
function toCaptureQueryWireShape(filters: Readonly<CaptureQueryFilters>) {
  return {
    Limit: filters.limit ?? 0,
    Cursor: filters.cursor ?? '',
    Route: filters.route ?? '',
    Outcome: filters.outcome ?? '',
    Kind: filters.kind ?? '',
    AnimeID: filters.animeId ?? '',
    ErrorCode: filters.errorCode ?? '',
    HTTPStatus: filters.httpStatus,
    StartMS: filters.startMs,
    EndMS: filters.endMs,
    DeviceID: filters.deviceId ?? '',
    ChangelogID: filters.changelogId,
  };
}

/**
 * Maps the app-facing summary filters into the aggregation binding's wire
 * request. It deliberately carries NO `Limit`/`Cursor`: `contracts.
 * CaptureSummaryQuery` has no pagination fields, because an aggregation spans
 * the whole matched set rather than one page.
 *
 * The pointer-typed fields follow the same rule as the list query — forwarded
 * as-is, never defaulted, so an absent status adds no predicate and changelog
 * id 0 stays a real filter.
 */
function toCaptureSummaryWireShape(filters: Readonly<CaptureSummaryFilters>) {
  return {
    Route: filters.route ?? '',
    Outcome: filters.outcome ?? '',
    Kind: filters.kind ?? '',
    AnimeID: filters.animeId ?? '',
    ErrorCode: filters.errorCode ?? '',
    HTTPStatus: filters.httpStatus,
    StartMS: filters.startMs,
    EndMS: filters.endMs,
    DeviceID: filters.deviceId ?? '',
    ChangelogID: filters.changelogId,
  };
}

/**
 * Creates the singleton runtime-backed capture transaction source. Both
 * reads degrade to an empty/not-found, `degraded: true` result rather than
 * rejecting when the Wails bindings are not yet attached.
 */
export function createCaptureTransactionSource(): CaptureTransactionSource {
  if (CAPTURE_TRANSACTION_SOURCE_STATE.sharedSource !== null) {
    return CAPTURE_TRANSACTION_SOURCE_STATE.sharedSource;
  }

  CAPTURE_TRANSACTION_SOURCE_STATE.sharedSource = {
    listTransactions(filters): Promise<CapturePage> {
      return invokeGoBinding<CapturePage>(
        'ListCaptureTransactions',
        () => ListCaptureTransactions(toCaptureQueryWireShape(filters)),
        () => DEGRADED_EMPTY_CAPTURE_PAGE,
      );
    },
    getTransaction(requestId): Promise<CaptureDetailResult> {
      return invokeGoBinding<CaptureDetailResult>(
        'GetCaptureTransaction',
        () => GetCaptureTransaction(requestId),
        () => DEGRADED_CAPTURE_DETAIL_RESULT,
      );
    },
    summarizeTransactions(filters): Promise<CaptureSummary> {
      return invokeGoBinding<CaptureSummary>(
        'SummarizeCaptureTransactions',
        () => SummarizeCaptureTransactions(toCaptureSummaryWireShape(filters)),
        () => DEGRADED_CAPTURE_SUMMARY,
      );
    },
  };

  return CAPTURE_TRANSACTION_SOURCE_STATE.sharedSource;
}

/** Reports whether the capture transaction bindings are currently attached. */
export function isCaptureTransactionRuntimeAvailable(): boolean {
  return hasGoBinding('ListCaptureTransactions') && hasGoBinding('GetCaptureTransaction');
}

