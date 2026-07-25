import type { CaptureRuntimeSource } from './capture-runtime-source.types';

/** Wails runtime event name the bridge emits once per persisted capture record. */
export const CAPTURE_TRANSACTION_EVENT_NAME = 'capture.transaction';

/** Module-local singleton container for the shared capture runtime source. */
export const CAPTURE_RUNTIME_SOURCE_STATE: { sharedSource: CaptureRuntimeSource | null } = {
  sharedSource: null,
};
