import type { CaptureRow } from '../../shared/contracts/capture.types';

/**
 * Push port over the bridge's `capture.transaction` Wails runtime event
 * stream (design.md "Emit choke point"). Emits one `CaptureRow` per
 * persisted capture record (arrival or terminal upsert); degrades to a
 * no-op subscription instead of throwing when the runtime is unavailable.
 */
export interface CaptureRuntimeSource {
  readonly subscribeCaptureTransactions: (listener: (row: CaptureRow) => void) => () => void;
}
