import type { BridgeError } from '../../../../shared/query/bridge-error/bridge-error.types';

/** The part of the reconcile mutation the feedback is derived from (a `useBridgeMutation` result fits it). */
export interface ReconcileMutationState {
  readonly status: 'idle' | 'pending' | 'success' | 'error';
  readonly error: BridgeError | null;
}
