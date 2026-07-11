import { useCallback, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';

/** Drives the dashboard reconcile action, exposing sync state and the trigger callback. */
export function useBridgeDashboard(source: BridgeRuntimeSource = bridgeRuntimeSource) {
  // 1. Refs

  // 2. State
  const [syncResult, setSyncResult] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingAnimeRefreshToken, setSyncingAnimeRefreshToken] = useState(0);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onTriggerSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncResult('');

    try {
      const result = await source.triggerReconcile();

      setSyncResult(result);
      setSyncingAnimeRefreshToken((currentToken) => currentToken + 1);
    } finally {
      setIsSyncing(false);
    }
  }, [source]);

  // 7. Effects

  return {
    syncResult,
    isSyncing,
    syncingAnimeRefreshToken,
    onTriggerSync,
  };
}
