import { BridgeQueryProvider } from '../../shared/query/BridgeQueryProvider/BridgeQueryProvider';
import {
  BRIDGE_EVENT_SOURCE,
  BRIDGE_INVALIDATIONS,
  BRIDGE_QUERY_CLIENT,
  BRIDGE_READINESS_GATE,
} from '../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { BridgeDataProviderProps } from './bridge-data-provider.types';

/**
 * Composition only (ADR-032 §4): mounts `BridgeQueryProvider` with the Wails readiness and event
 * adapters, query client and invalidation rules that `shared/query/bridge-runtime` builds.
 */
export function BridgeDataProvider({ children }: Readonly<BridgeDataProviderProps>) {
  return (
    <BridgeQueryProvider
      client={BRIDGE_QUERY_CLIENT}
      readinessGate={BRIDGE_READINESS_GATE}
      eventSource={BRIDGE_EVENT_SOURCE}
      invalidations={BRIDGE_INVALIDATIONS}
    >
      {children}
    </BridgeQueryProvider>
  );
}
