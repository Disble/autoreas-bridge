import { useCallback, useState } from 'react';
import { triggerReconcile } from '../../dashboard.bindings';

/** Drives the dashboard reconcile action, exposing sync state and the trigger callback. */
export function useBridgeDashboard() {
  // 1. Refs

  // 2. State
  const [syncResult, setSyncResult] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onTriggerSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncResult('');

    try {
      const result = await triggerReconcile();

      setSyncResult(result);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 7. Effects

  return {
    syncResult,
    isSyncing,
    onTriggerSync,
  };
}
