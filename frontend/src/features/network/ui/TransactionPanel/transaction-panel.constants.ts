/** Default page size for ListCaptureTransactions when the panel does not override it. */
export const DEFAULT_TRANSACTION_PAGE_LIMIT = 25;

/**
 * Rows rendered before the first growth, and the batch the visible window
 * grows by on load-more.
 *
 * Deliberately equal to {@link DEFAULT_TRANSACTION_PAGE_LIMIT}, so one
 * load-more reveals exactly one fetched page and the two numbers cannot drift
 * apart. Written as a literal rather than aliasing that constant so a change to
 * either one is a deliberate decision about the rail it belongs to.
 */
export const TRANSACTION_PAGE_INITIAL_COUNT = 25;

/** Null Object placeholder for an absent value. */
export const TRANSACTION_EMPTY_LABEL = '–';

/**
 * Notice shown for a response pane with no captured body. A bodyless response
 * such as 204 is genuinely empty; this notice avoids implying anything was
 * silently discarded.
 */
export const TRANSACTION_RESPONSE_NOT_CAPTURED_NOTICE =
  'This response did not include a body.';

/**
 * Notice shown when a response body equals `CAPTURE_REDACTION_MARKER`. The
 * hotfix now preserves exact bodies, so this marker is legacy/degraded data.
 */
/** Notice shown when pre-auth request capture skipped a declared oversized body. */
export const TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE =
  'Body capture was skipped before authentication because the declared request body exceeded the 65536-byte safety budget.';

/** Notice shown when pre-auth request capture skipped an unknown-length body. */
export const TRANSACTION_REQUEST_BODY_OMITTED_STREAMING_NOTICE =
  'Body capture was skipped before authentication because the request body size was not declared.';

/** Notice shown when only the first 65536 response-body bytes were retained. */
export const TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE =
  'Showing the first 65536 bytes only. The response exceeded the capture safety budget.';

/** Notice shown for a request pane whose captured payload carries no fields. */
export const TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE = 'This request did not include a body.';

/** Standing note on the captured body panes: the body shown is the captured wire content. */
export const TRANSACTION_BODY_PROJECTION_NOTE = 'Showing the captured body exactly as recorded.';

/** Placeholder for the exact HTTP status filter input. */
export const TRANSACTION_STATUS_FILTER_PLACEHOLDER = '404';

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

