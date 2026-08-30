import type { CaptureTransactionSource } from './capture-transaction-source.types';

/** Degraded-empty page returned when the Wails bindings are unavailable. */
export const DEGRADED_EMPTY_CAPTURE_PAGE = {
  items: [],
  appliedLimit: 0,
  malformedRowsSkipped: 0,
  warningCount: 0,
  degraded: true,
} as const;

/** Degraded not-found result returned when the Wails bindings are unavailable. */
export const DEGRADED_CAPTURE_DETAIL_RESULT = {
  found: false,
  item: {
    requestId: '',
    capturedAtMs: 0,
    kind: '',
    route: '',
    transport: '',
    outcome: '',
    payload: {},
    correlations: { operationRefs: [] },
    deviceId: '',
    deviceName: '',
  },
  degraded: true,
} as const;

/** Module-local singleton container for the shared capture transaction source. */
export const CAPTURE_TRANSACTION_SOURCE_STATE: { sharedSource: CaptureTransactionSource | null } = {
  sharedSource: null,
};

/**
 * Degraded aggregation returned when the Wails bindings are unavailable. It
 * stays `degraded: true` so an unreadable reader is disclosed rather than
 * presented as "no request produced an error".
 */
export const DEGRADED_CAPTURE_SUMMARY = {
  groups: [],
  degraded: true,
} as const;
