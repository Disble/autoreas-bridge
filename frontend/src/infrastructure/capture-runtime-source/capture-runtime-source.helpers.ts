import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { CaptureRow } from '../../shared/contracts/capture.types';
import { createRuntimeSubscription } from '../wails-bindings.helpers';
import { CAPTURE_RUNTIME_SOURCE_STATE, CAPTURE_TRANSACTION_EVENT_NAME } from './capture-runtime-source.constants';
import type { CaptureRuntimeSource } from './capture-runtime-source.types';

/**
 * Creates the singleton runtime-backed capture source that pushes
 * `capture.transaction` events. Shares one Wails listener across every
 * consumer (`createRuntimeSubscription`) and degrades to a no-op
 * subscription (never throws, never invokes the listener) when the Wails
 * runtime bindings are not attached.
 */
export function createCaptureRuntimeSource(): CaptureRuntimeSource {
  if (CAPTURE_RUNTIME_SOURCE_STATE.sharedSource !== null) {
    return CAPTURE_RUNTIME_SOURCE_STATE.sharedSource;
  }

  const captureSubscription = createRuntimeSubscription<CaptureRow>((emit) => {
    return EventsOn(CAPTURE_TRANSACTION_EVENT_NAME, (row: CaptureRow) => emit(row));
  });

  CAPTURE_RUNTIME_SOURCE_STATE.sharedSource = {
    subscribeCaptureTransactions(listener) {
      return captureSubscription.subscribe(listener);
    },
  };

  return CAPTURE_RUNTIME_SOURCE_STATE.sharedSource;
}

/** Shared capture runtime source singleton used across hooks and stores. */
export const captureRuntimeSource = createCaptureRuntimeSource();
