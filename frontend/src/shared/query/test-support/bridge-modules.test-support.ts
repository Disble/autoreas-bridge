import type { QueryClient } from '@tanstack/react-query';

import type { ModuleReadiness } from '../../contracts/readiness.types';
import { BRIDGE_INVALIDATIONS } from '../bridge-runtime/bridge-runtime.constants';
import { connectInvalidationBridge } from '../invalidation-bridge/invalidation-bridge.helpers';
import { createReadinessGate } from '../readiness-gate/readiness-gate.helpers';
import { createBridgeQueryTestWrapper } from './bridge-query.test-support';
import { staticSource } from './readiness-source.test-support';

/**
 * Test-only query wrapper whose readiness gate reports `snapshot`: name every
 * module the code under test gates on. `emit` pushes a later transition.
 * @param snapshot The modules every readiness read answers.
 * @returns The client, the wrapper to render with, and `emit`.
 */
export function createModulesTestWrapper(...snapshot: ModuleReadiness[]) {
  const readiness = staticSource(...snapshot);
  const { client, wrapper } = createBridgeQueryTestWrapper({ readinessGate: createReadinessGate(readiness.source) });

  return { client, wrapper, emit: readiness.emit };
}

/**
 * Test-only connection of the app's real `BRIDGE_INVALIDATIONS` to a fake
 * backend event source, so a test fires a Wails event by name.
 * @param client The client the code under test renders with.
 * @returns `emit` (fires one backend event) and `disconnect`.
 */
export function connectBridgeEvents(client: QueryClient) {
  const listeners = new Map<string, () => void>();
  const disconnect = connectInvalidationBridge(client, BRIDGE_INVALIDATIONS, {
    subscribe: (eventName, listener) => {
      listeners.set(eventName, listener);
      return () => listeners.delete(eventName);
    },
  });

  return { emit: (eventName: string) => listeners.get(eventName)?.(), disconnect };
}
