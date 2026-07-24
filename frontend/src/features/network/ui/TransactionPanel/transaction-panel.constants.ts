import type { TransactionStatusClassFilterOption } from './transaction-panel.types';

/** Default page size for ListCaptureTransactions when the panel does not override it. */
export const DEFAULT_TRANSACTION_PAGE_LIMIT = 25;

/** Null Object placeholder for an absent value. */
export const TRANSACTION_EMPTY_LABEL = '–';

/** Placeholder shown for optional telemetry the capture pipeline never recorded. */
export const TRANSACTION_NOT_CAPTURED_LABEL = 'Not captured';

/** Free-text filter input placeholder. */
export const TRANSACTION_FILTER_PLACEHOLDER = 'Filter by route, kind, outcome, or error code';

/** Empty-state message for the transaction table before any data has loaded. */
export const TRANSACTION_LOADING_STATE_MESSAGE = 'Loading captured transactions...';

/** Empty-state message for the transaction table once loaded with no matches. */
export const TRANSACTION_EMPTY_STATE_MESSAGE = 'No captured transactions match the current filters.';

/** Warning shown when the capture read path is degraded (reader unavailable or query failed). */
export const TRANSACTION_CAPTURE_DEGRADED_MESSAGE =
  'Captured transaction data is temporarily unavailable. Showing whatever was already loaded.';

/** Detail inspector tab labels. */
export const TRANSACTION_DETAIL_TAB_LABELS = {
  general: 'General',
  request: 'Request',
  response: 'Response',
} as const;

/** Status-class filter pill options for TransactionFilterBar. */
export const TRANSACTION_STATUS_CLASS_FILTER_OPTIONS: readonly TransactionStatusClassFilterOption[] = [
  { value: 'all', label: 'All' },
  { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' },
  { value: '4xx', label: '4xx' },
  { value: '5xx', label: '5xx' },
];
