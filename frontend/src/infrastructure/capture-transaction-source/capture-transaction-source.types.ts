import type {
  CaptureDetailResult,
  CapturePage,
  CaptureQueryFilters,
  CaptureSummary,
  CaptureSummaryFilters,
} from '../../shared/contracts/capture.types';

/**
 * In-process read source over the bridge's captured HTTP transactions,
 * backed by the Wails-bound `ListCaptureTransactions`/`GetCaptureTransaction`/
 * `SummarizeCaptureTransactions` methods (design.md "Bound surface"). Degrades
 * to an empty/degraded result instead of throwing when the bindings are
 * unavailable.
 *
 * `summarizeTransactions` is the desktop peer of the MCP's `summary_requests`:
 * the same reader, the same grouping, reached in-process instead of through
 * the sidecar.
 */
export interface CaptureTransactionSource {
  readonly listTransactions: (filters: CaptureQueryFilters) => Promise<CapturePage>;
  readonly getTransaction: (requestId: string) => Promise<CaptureDetailResult>;
  readonly summarizeTransactions: (filters: CaptureSummaryFilters) => Promise<CaptureSummary>;
}
