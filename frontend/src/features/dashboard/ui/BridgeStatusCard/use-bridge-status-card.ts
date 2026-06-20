import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import { getSQLiteStatusTone, isSQLiteStatusLoading } from './bridge-status-card.helpers';

/** Loads the SQLite status from the backend and derives its display tone. */
export function useBridgeStatusCard(source: BridgeRuntimeSource = bridgeRuntimeSource) {
  // 1. Refs

  // 2. State
  const [sqliteStatus, setSqliteStatus] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isLoading = useMemo(() => isSQLiteStatusLoading(sqliteStatus), [sqliteStatus]);
  const statusTone = useMemo(() => getSQLiteStatusTone(sqliteStatus), [sqliteStatus]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    void source.getSQLiteStatus().then(setSqliteStatus);
  }, [source]);

  return {
    sqliteStatus,
    isLoading,
    statusTone,
  };
}
