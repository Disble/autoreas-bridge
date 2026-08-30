/**
 * Frontend mirror of `internal/api/contracts/capture.go`'s DTOs
 * (design.md "Interfaces / Contracts"). Field names follow the Go structs'
 * JSON tags (camelCase); `CaptureQueryFilters` is the app-facing filter
 * shape the infrastructure adapter maps into the Wails binding's wire
 * request (which has no JSON tags and uses the raw Go field names).
 */

/**
 * App-facing filter/pagination params for ListCaptureTransactions. Every
 * field is optional and an omitted field applies no predicate at all, which
 * is what keeps NULL-status (websocket) captures visible while no status
 * filter is chosen.
 */
export interface CaptureQueryFilters {
  readonly limit?: number;
  readonly cursor?: string;
  readonly route?: string;
  readonly outcome?: string;
  readonly kind?: string;
  readonly animeId?: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly deviceId?: string;
  /** 0 is a valid changelog id, so absence is `undefined` and never a zero value. */
  readonly changelogId?: number;
}

/** One transaction-list row: the fixed base projection fields. */
export interface CaptureRow {
  readonly requestId: string;
  readonly capturedAtMs: number;
  readonly kind: string;
  readonly route: string;
  readonly transport: string;
  readonly outcome: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
  readonly durationMs?: number;
  readonly animeId?: string;
}

/** One ListCaptureTransactions page; Items is always a non-null array. */
export interface CapturePage {
  readonly items: readonly CaptureRow[];
  readonly nextCursor?: string;
  readonly appliedLimit: number;
  readonly malformedRowsSkipped: number;
  readonly warningCount: number;
  readonly degraded: boolean;
}

/** One reconcile operation reference surfaced on a transaction's correlations. */
export interface CaptureOperationRef {
  readonly animeId: string;
  readonly operation: string;
  readonly outcome: string;
}

/** Auxiliary effect references correlated with one captured transaction. */
export interface CaptureCorrelations {
  readonly changelogIds?: readonly number[];
  readonly operationRefs: readonly CaptureOperationRef[];
  readonly conflictIds?: readonly string[];
  readonly activityIds?: readonly number[];
}

/** One full transaction detail: the list row plus body/header/correlation data. */
export interface CaptureDetail extends CaptureRow {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestBody?: string;
  readonly requestBodyState?: string;
  readonly responseBody?: string;
  readonly responseBodyState?: string;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly responseHeaders?: Readonly<Record<string, string>>;
  readonly correlations: CaptureCorrelations;
  readonly deviceId: string;
  readonly deviceName: string;
}

/** GetCaptureTransaction result envelope. */
export interface CaptureDetailResult {
  readonly found: boolean;
  readonly item: CaptureDetail;
  readonly degraded: boolean;
}

/**
 * App-facing filters for SummarizeCaptureTransactions: exactly the filters the
 * transaction list accepts, minus pagination — an aggregation has no page.
 * Derived from {@link CaptureQueryFilters} rather than restated so the two
 * filter sets can never drift apart.
 */
export type CaptureSummaryFilters = Omit<CaptureQueryFilters, 'limit' | 'cursor'>;

/** One bounded recent-error reference attached to a request-health group. */
export interface CaptureErrorSample {
  readonly requestId: string;
  readonly capturedAtMs: number;
  readonly errorCode: string;
}

/**
 * One (route, http status, outcome) request-health group.
 *
 * `httpStatus` is optional and its absence is a fact, not a missing value: a
 * websocket capture never produced an HTTP status, and measured 2026-08-30
 * those were 40.8% of the stored table. Rendering an absent status as 0 would
 * report a status the bridge never returned.
 */
export interface CaptureSummaryGroup {
  readonly route: string;
  readonly httpStatus?: number;
  readonly outcome: string;
  readonly count: number;
  readonly latestErrorSamples: readonly CaptureErrorSample[];
}

/**
 * One SummarizeCaptureTransactions result: the groups ordered count-descending
 * plus the reader's degradation flag. `groups` is always a non-null array, so
 * an unmatched filter set is a zeroed aggregation rather than a null.
 */
export interface CaptureSummary {
  readonly groups: readonly CaptureSummaryGroup[];
  readonly degraded: boolean;
}
