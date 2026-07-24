import type { CaptureDetailResult, CapturePage, CaptureQueryFilters } from '../../shared/contracts/capture.types';

/**
 * In-process read source over the bridge's captured HTTP transactions,
 * backed by the Wails-bound `ListCaptureTransactions`/`GetCaptureTransaction`
 * methods (design.md "Bound surface"). Degrades to an empty/degraded result
 * instead of throwing when the bindings are unavailable.
 */
export interface CaptureTransactionSource {
  readonly listTransactions: (filters: CaptureQueryFilters) => Promise<CapturePage>;
  readonly getTransaction: (requestId: string) => Promise<CaptureDetailResult>;
}
