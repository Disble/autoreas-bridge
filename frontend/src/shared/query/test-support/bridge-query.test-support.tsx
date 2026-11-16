import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createBridgeQueryClient } from '../query-client/query-client.helpers';
import { ReadinessGateContext } from '../readiness-gate/readiness-gate-context';
import type { ReadinessGate } from '../readiness-gate/readiness-gate.types';

/** Options of `createBridgeQueryTestWrapper`. */
interface BridgeQueryTestWrapperOptions {
  /** Gate a module-gated query waits on; null (default) fails such queries as `internal`. */
  readonly readinessGate?: ReadinessGate | null;
  /** Client to render with; a fresh `createBridgeQueryClient()` by default. */
  readonly client?: QueryClient;
}

/** Props of the wrapper component the factory returns. */
interface BridgeQueryTestWrapperProps {
  readonly children: ReactNode;
}

/**
 * Test-only wrapper for hooks and components that call `useBridgeQuery` or
 * `useBridgeMutation`: a fresh client per call (no cache shared between tests)
 * and an optional readiness gate. Pass `wrapper` to `renderHook` or `render`.
 */
export function createBridgeQueryTestWrapper(options: BridgeQueryTestWrapperOptions = {}) {
  const client = options.client ?? createBridgeQueryClient();
  const readinessGate = options.readinessGate ?? null;

  /** Provides the client and the gate to the tree under test. */
  function BridgeQueryTestWrapper({ children }: Readonly<BridgeQueryTestWrapperProps>) {
    return (
      <QueryClientProvider client={client}>
        <ReadinessGateContext value={readinessGate}>{children}</ReadinessGateContext>
      </QueryClientProvider>
    );
  }

  return { client, wrapper: BridgeQueryTestWrapper };
}
