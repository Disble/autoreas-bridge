import type { TransactionStatusClassFilterOption } from './transaction-panel.types';

/** Default page size for ListCaptureTransactions when the panel does not override it. */
export const DEFAULT_TRANSACTION_PAGE_LIMIT = 25;

/** Null Object placeholder for an absent value. */
export const TRANSACTION_EMPTY_LABEL = '–';

/** Placeholder shown for optional telemetry the capture pipeline never recorded. */
export const TRANSACTION_NOT_CAPTURED_LABEL = 'Not captured';

/**
 * The exact literal the capture pipeline writes over a response body it
 * could not sanitize safely (source of truth:
 * `internal/observability/requestcapture/telemetry.go`'s
 * `redactedResponseBodyMarker`). Detected by exact equality only.
 */
export const CAPTURE_REDACTION_MARKER = '{"error":"response body redacted"}';

/**
 * Notice shown for a response pane with no captured body. Response bodies
 * are only captured for error responses (`status >= 400`), so a 2xx
 * transaction legitimately has none — this reads as expected, not a fault.
 */
export const TRANSACTION_RESPONSE_NOT_CAPTURED_NOTICE =
  'No response body was captured for this transaction. Response bodies are only captured for error responses (status 400 and above); a successful (2xx) transaction has none by design.';

/**
 * Notice shown when a response body equals `CAPTURE_REDACTION_MARKER`. The
 * capture pipeline records no truncation signal, so the notice names every
 * possible cause instead of guessing one — it MUST NOT say "truncated".
 */
export const TRANSACTION_RESPONSE_REDACTED_NOTICE =
  'This response body was redacted by the capture pipeline. This can happen when the body is not JSON, when the sanitized result exceeds 2 KB, or when the raw capture was cut at its 4096-byte cap — the pipeline records no signal for which cause applied.';

/** Notice shown for a request pane whose captured payload carries no fields. */
export const TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE = 'No request payload was captured for this transaction.';

/**
 * Standing note on the captured body panes: the captured content is a
 * key-allowlisted projection of the real wire body, not a verbatim copy —
 * this pane never claims completeness.
 */
export const TRANSACTION_BODY_PROJECTION_NOTE =
  'Captured bodies are a sanitized, key-allowlisted projection of the real wire body, not a verbatim copy.';

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
