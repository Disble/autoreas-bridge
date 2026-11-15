import { DEVICES_WORKSPACE_SYNC_OK_RESULT } from './devices-workspace.constants';
import type { ReconcileMutationState } from './devices-workspace.types';

/**
 * Tells the Devices page whether a reconcile response should render feedback.
 * This keeps the render branch explicit and out of the delivery/component layer.
 */
export function hasSyncResult(syncResult: string) {
  return syncResult.length > 0;
}

/**
 * The reconcile feedback to show for the mutation's state: the success text,
 * the failure's message, or nothing while idle or pending.
 * @param mutation The reconcile mutation's status and error.
 * @returns The feedback text; empty hides the Alert.
 */
export function toSyncResult(mutation: ReconcileMutationState): string {
  if (mutation.status === 'success') {
    return DEVICES_WORKSPACE_SYNC_OK_RESULT;
  }

  return mutation.status === 'error' ? (mutation.error?.message ?? '') : '';
}
