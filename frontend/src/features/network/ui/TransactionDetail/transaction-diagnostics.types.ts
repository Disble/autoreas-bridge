/** One labelled row of a projected sync diagnostics report. */
export interface TransactionDiagnosticsRow {
  readonly label: string;
  readonly value: string;
}

/**
 * The projected reading of one diagnostics capture's request body, in one of
 * two honest shapes: the labelled values the report carries, or an explicit
 * no-report notice when the capture cannot yield a report (body skipped by a
 * pre-auth rule, empty, or unreadable). A field absent from the payload never
 * becomes a row, so absence can never be rendered as `0`, `-`, or `''`.
 */
export type TransactionDiagnosticsReportViewModel =
  | { readonly kind: 'report'; readonly rows: readonly TransactionDiagnosticsRow[] }
  | { readonly kind: 'no-report'; readonly notice: string };
