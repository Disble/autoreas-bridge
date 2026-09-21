/** Default page size for ListCaptureTransactions when the panel does not override it. */
export const DEFAULT_TRANSACTION_PAGE_LIMIT = 25;

/**
 * Constant estimated height of one transaction row in px, the input the
 * virtual window's `estimateSize` runs on.
 *
 * The layout smoke measures a real transaction row at 36-39 px, so 36 is the
 * floor of the band. The drift risk is recorded here on purpose instead of
 * turning on dynamic `measureElement`: with a constant estimate the spacer
 * math is exact by construction, while real rows up to 3 px taller make the
 * scrollbar under-report by at most ~0.1% per row inside the window band
 * (spacers are computed from the same estimate, so total scroll height stays
 * exact for the ESTIMATED layout; only real content position can drift a few
 * px inside the mounted window). Revisit dynamic measurement only if a real
 * engine shows visible scroll drift.
 */
export const TRANSACTION_ROW_HEIGHT_ESTIMATE_PX = 36;

/** Rows the virtual window renders beyond each visible edge. */
export const TRANSACTION_VIRTUAL_OVERSCAN_ROWS = 5;

/**
 * Viewport the virtual window assumes before a real measurement arrives.
 *
 * A measured 0x0 rect would produce an EMPTY virtual window (the range math
 * treats a zero viewport as "nothing visible"), which is what a bare jsdom
 * element measures. The hook maps a zero measurement to this viewport, so
 * tests run against a deterministic 1024x600 rail (the same figure the
 * virtualization spike used) and a real engine only ever sees it between
 * mount and its first rect observation, which ResizeObserver resolves in the
 * same frame.
 */
export const TRANSACTION_VIRTUAL_INITIAL_VIEWPORT_PX = { width: 1_024, height: 600 };

/** Column count of the transaction table; the virtual spacer cells span all of them. */
export const TRANSACTION_TABLE_COLUMN_COUNT = 6;

/** Collection id of the virtual spacer row carrying the height above the window. */
export const TRANSACTION_TABLE_SPACER_TOP_ID = 'transaction-virtual-spacer-top';

/** Collection id of the virtual spacer row carrying the height below the window. */
export const TRANSACTION_TABLE_SPACER_BOTTOM_ID = 'transaction-virtual-spacer-bottom';

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

/**
 * Placeholder for the Route filter input: a fragment that actually exists in
 * the capture store's route set, taught as a substring match. The previous
 * placeholder named a full per-anime route, which the owner typed verbatim
 * and got zero rows.
 */
export const TRANSACTION_ROUTE_FILTER_PLACEHOLDER = 'animes';

/** Empty-state message for the transaction table before any data has loaded. */
export const TRANSACTION_LOADING_STATE_MESSAGE = 'Loading captured transactions...';

/** Empty-state message for the transaction table once loaded with no matches. */
export const TRANSACTION_EMPTY_STATE_MESSAGE = 'No captured transactions match the current filters.';

/** Warning shown when the capture read path is degraded (reader unavailable or query failed). */
export const TRANSACTION_CAPTURE_DEGRADED_MESSAGE =
  'Captured transaction data is temporarily unavailable. Showing whatever was already loaded.';

/** Copy for the limits line when the facts binding could not report the capture store's retention. */
export const TRANSACTION_RETENTION_UNAVAILABLE_NOTE =
  "the capture store's retention limit is currently unavailable.";

/** Placeholder rows `TransactionTable` renders per unresolved page fetch, mirroring its six columns. */
export const TRANSACTION_TABLE_SKELETON_ROW_COUNT = 6;

/** Detail inspector tab labels. */
export const TRANSACTION_DETAIL_TAB_LABELS = {
  general: 'General',
  request: 'Request',
  response: 'Response',
} as const;

/**
 * The exact wire route the capture layer records for sync diagnostics
 * submissions. Both the detail inspector's report projection and the
 * Transactions filter preset key off this literal; a diagnostics capture
 * cannot be attributed to a device (the body carries no device_id, identity
 * travels only in the Authorization header, and the capture layer records
 * none), which is why route equality is the only honest selector here.
 */
export const SYNC_DIAGNOSTICS_ROUTE = '/api/sync/diagnostics';

/** Label of the Transactions filter preset that applies the diagnostics route filter in one action. */
export const TRANSACTION_SYNC_DIAGNOSTICS_FILTER_LABEL = 'Sync diagnostics reports';

/** Notice shown when a diagnostics capture has a body that cannot be read as a sync diagnostics report. */
export const TRANSACTION_DIAGNOSTICS_NO_REPORT_NOTICE =
  'The captured body could not be read as a sync diagnostics report.';

