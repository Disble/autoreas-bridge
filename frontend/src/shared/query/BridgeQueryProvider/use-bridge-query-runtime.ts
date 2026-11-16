import { useEffect } from 'react';

import { connectInvalidationBridge } from '../invalidation-bridge/invalidation-bridge.helpers';
import { rerunFailedGatedQueries } from '../use-bridge-query/use-bridge-query.helpers';
import type { BridgeQueryRuntime } from './bridge-query-provider.types';

/**
 * Starts the app-wide query runtime once per provider: the readiness gate
 * subscribes to `bridge.readiness` and asks for the snapshot, a module that
 * settles re-runs its gated queries left in error, and the invalidation bridge
 * listens to every registered backend event until unmount.
 */
export function useBridgeQueryRuntime({ client, readinessGate, eventSource, invalidations }: Readonly<BridgeQueryRuntime>): void {
  // 7. Effects
  useEffect(() => {
    readinessGate.start();
  }, [readinessGate]);

  useEffect(
    () => readinessGate.onSettled((status) => void rerunFailedGatedQueries(client, status.module)),
    [client, readinessGate],
  );

  useEffect(() => connectInvalidationBridge(client, invalidations, eventSource), [client, invalidations, eventSource]);
}
