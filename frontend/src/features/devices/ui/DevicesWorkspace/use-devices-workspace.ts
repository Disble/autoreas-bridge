import { useCallback, useState } from 'react';
import type { DevicesSource } from '../../../../shared/contracts/devices.types';
import { BRIDGE_DEVICES_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { toSyncResult } from './devices-workspace.helpers';

/**
 * Drives the Devices page reconcile action: `TriggerReconcile` through
 * `useBridgeMutation`, its feedback, and the refresh token the syncing panel
 * re-reads its queue on after a reconcile succeeds.
 * @param source The Devices port the reconcile goes through.
 * @returns The reconcile state, its feedback, the refresh token and the trigger.
 */
export function useDevicesWorkspace(source: Pick<DevicesSource, 'triggerReconcile'> = BRIDGE_DEVICES_SOURCE) {
  // 1. Refs

  // 2. State
  const [syncingAnimeRefreshToken, setSyncingAnimeRefreshToken] = useState(0);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const reconcile = useBridgeMutation({
    mutationFn: () => source.triggerReconcile(),
    onSuccess: () => setSyncingAnimeRefreshToken((currentToken) => currentToken + 1),
  });

  // 5. Derived State
  const syncResult = toSyncResult(reconcile);
  const isSyncFailed = reconcile.isError;

  // 6. Callbacks (useCallback calling pure helpers)
  const { mutateAsync } = reconcile;
  const onTriggerSync = useCallback(() => mutateAsync(), [mutateAsync]);

  // 7. Effects

  return {
    syncResult,
    isSyncFailed,
    isSyncing: reconcile.isPending,
    syncingAnimeRefreshToken,
    onTriggerSync,
  };
}
