import { createContext } from 'react';

import type { ReadinessGate } from './readiness-gate.types';

/**
 * The readiness gate `BridgeQueryProvider` hands to `useBridgeQuery`. Null
 * outside a provider: a query naming a module then fails as `internal`.
 */
export const ReadinessGateContext = createContext<ReadinessGate | null>(null);
