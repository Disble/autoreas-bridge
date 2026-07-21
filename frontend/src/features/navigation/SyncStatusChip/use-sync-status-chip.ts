import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import {
  getSQLiteStatusTone,
  isSQLiteStatusLoading,
} from '../../dashboard/ui/BridgeStatusCard/bridge-status-card.helpers';

/**
 * Drives the rail footer sync-status chip. Reuses the same
 * `getSQLiteStatus` source as `useBridgeStatusCard` so this adds no new
 * Wails call, and exposes the Devices page as the chip's link target.
 */
export function useSyncStatusChip(source: BridgeRuntimeSource = bridgeRuntimeSource) {
  // 1. Refs

  // 2. State
  const [status, setStatus] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isLoading = useMemo(() => isSQLiteStatusLoading(status), [status]);
  const statusTone = useMemo(() => getSQLiteStatusTone(status), [status]);
  const linkTo = '/devices';

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    void source.getSQLiteStatus().then(setStatus);
  }, [source]);

  return {
    status,
    isLoading,
    statusTone,
    linkTo,
  };
}
