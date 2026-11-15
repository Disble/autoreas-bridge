import { useEffect } from 'react';

import { connectInvalidationBridge } from '../invalidation-bridge/invalidation-bridge.helpers';
import type { BridgeQueryRuntime } from './bridge-query-provider.types';

/**
 * Starts the app-wide query runtime once per provider: the readiness gate
 * subscribes to `bridge.readiness` and asks for the snapshot, and the
 * invalidation bridge listens to every registered backend event until unmount.
 */
export function useBridgeQueryRuntime({ client, readinessGate, eventSource, invalidations }: Readonly<BridgeQueryRuntime>): void {
  // 7. Effects
  useEffect(() => {
    readinessGate.start();
  }, [readinessGate]);

  useEffect(() => connectInvalidationBridge(client, invalidations, eventSource), [client, invalidations, eventSource]);
}
