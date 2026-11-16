import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { InvalidationRegistry, RuntimeEventSource } from '../invalidation-bridge/invalidation-bridge.types';
import type { ReadinessGate } from '../readiness-gate/readiness-gate.types';

/** What `src/app` wires into `shared/query`: the client and the concrete ports. */
export interface BridgeQueryRuntime {
  readonly client: QueryClient;
  readonly readinessGate: ReadinessGate;
  readonly eventSource: RuntimeEventSource;
  readonly invalidations: InvalidationRegistry;
}

/** Props of `BridgeQueryProvider`. */
export interface BridgeQueryProviderProps extends BridgeQueryRuntime {
  readonly children: ReactNode;
}
