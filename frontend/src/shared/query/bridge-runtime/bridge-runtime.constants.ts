import { createReadinessSource } from '../../../infrastructure/readiness/readiness-source.helpers';
import { createRuntimeEventSource } from '../../../infrastructure/wails-bindings.helpers';
import { createInvalidationRegistry } from '../invalidation-bridge/invalidation-bridge.helpers';
import { createBridgeQueryClient } from '../query-client/query-client.helpers';
import { createReadinessGate } from '../readiness-gate/readiness-gate.helpers';

// The one composition module of `shared/query` (ADR-032 §4): the only file here
// that imports `infrastructure/**`. Every other `shared/query` file depends on
// ports; `src/app` only mounts `BridgeQueryProvider` with these values.

/** The app's one query client, with the Bridge IPC defaults. */
export const BRIDGE_QUERY_CLIENT = createBridgeQueryClient();

/** The app's one readiness gate, over the Wails `GetReadiness` + `bridge.readiness` adapter. */
export const BRIDGE_READINESS_GATE = createReadinessGate(createReadinessSource());

/** The Wails runtime events the invalidation bridge listens through. */
export const BRIDGE_EVENT_SOURCE = createRuntimeEventSource();

/**
 * Every context's event→invalidation rules, the one place a context registers
 * them as it migrates (ADR-032, task T4 onward); none has registered yet.
 */
export const BRIDGE_INVALIDATIONS = createInvalidationRegistry([]);
