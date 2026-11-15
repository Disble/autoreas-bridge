import { QueryClientProvider } from '@tanstack/react-query';

import { ReadinessGateContext } from '../readiness-gate/readiness-gate-context';
import type { BridgeQueryProviderProps } from './bridge-query-provider.types';
import { useBridgeQueryRuntime } from './use-bridge-query-runtime';

/**
 * Provides the query client and the readiness gate to every `useBridgeQuery`,
 * and runs the gate and the invalidation bridge. Mounted once, by `src/app`.
 */
export function BridgeQueryProvider({ children, ...runtime }: Readonly<BridgeQueryProviderProps>) {
  useBridgeQueryRuntime(runtime);

  return (
    <QueryClientProvider client={runtime.client}>
      <ReadinessGateContext value={runtime.readinessGate}>{children}</ReadinessGateContext>
    </QueryClientProvider>
  );
}
