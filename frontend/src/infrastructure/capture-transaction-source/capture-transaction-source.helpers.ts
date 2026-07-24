import { GetCaptureTransaction, ListCaptureTransactions } from '../../../wailsjs/go/main/App';
import type { CaptureDetailResult, CapturePage, CaptureQueryFilters } from '../../shared/contracts/capture.types';
import { hasGoBinding, invokeGoBinding } from '../wails-bindings.helpers';
import {
  CAPTURE_TRANSACTION_SOURCE_STATE,
  DEGRADED_CAPTURE_DETAIL_RESULT,
  DEGRADED_EMPTY_CAPTURE_PAGE,
} from './capture-transaction-source.constants';
import type { CaptureTransactionSource } from './capture-transaction-source.types';

/**
 * Maps the app-facing (camelCase) filter shape into the Wails binding's wire
 * request. `contracts.CaptureQuery` carries no JSON tags, so the Go bound
 * method expects the raw (PascalCase) struct field names verbatim.
 */
export function toCaptureQueryWireShape(filters: Readonly<CaptureQueryFilters>) {
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
  };

  return CAPTURE_TRANSACTION_SOURCE_STATE.sharedSource;
}

/** Reports whether the capture transaction bindings are currently attached. */
export function isCaptureTransactionRuntimeAvailable(): boolean {
  return hasGoBinding('ListCaptureTransactions') && hasGoBinding('GetCaptureTransaction');
}

/** Shared capture transaction source singleton used across hooks and stores. */
export const captureTransactionSource = createCaptureTransactionSource();
