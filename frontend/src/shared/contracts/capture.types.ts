/**
 * Frontend mirror of `internal/api/contracts/capture.go`'s DTOs
 * (design.md "Interfaces / Contracts"). Field names follow the Go structs'
 * JSON tags (camelCase); `CaptureQueryFilters` is the app-facing filter
 * shape the infrastructure adapter maps into the Wails binding's wire
 * request (which has no JSON tags and uses the raw Go field names).
 */

/** App-facing filter/pagination params for ListCaptureTransactions. */
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
  readonly responseBody?: string;
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
