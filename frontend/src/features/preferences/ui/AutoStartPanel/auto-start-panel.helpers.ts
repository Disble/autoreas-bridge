import type { BridgeError } from '../../../../shared/query/bridge-error/bridge-error.types';

/**
 * The failed save to show beside the switch: the binding's message while the
 * last save failed, '' otherwise (a new save clears it, as the panel did).
 * @param save The save mutation's state.
 * @returns The failure message, or ''.
 */
export function toAutoStartSaveFailure(save: { readonly status: string; readonly error: BridgeError | null }): string {
  return save.status === 'error' ? (save.error?.message ?? '') : '';
}
