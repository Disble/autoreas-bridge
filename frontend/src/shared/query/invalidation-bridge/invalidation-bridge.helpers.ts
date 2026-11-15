import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { InvalidationRegistry, InvalidationRule, RuntimeEventSource } from './invalidation-bridge.types';

/**
 * Builds the one event→invalidation registry from every context's rules
 * (`src/app` composes them). Rules naming the same event merge, in rule order.
 */
export function createInvalidationRegistry(rules: readonly InvalidationRule[]): InvalidationRegistry {
  const registry = new Map<string, readonly QueryKey[]>();
  for (const rule of rules) {
    registry.set(rule.event, [...(registry.get(rule.event) ?? []), ...rule.queryKeys]);
  }

  return registry;
}

/**
 * Subscribes once per registered event and invalidates its query-key prefixes
 * on every emission; returns the function that releases every subscription.
 * Mounted once, by `BridgeQueryProvider`: realtime pushes refresh queries here
 * instead of in per-hook subscriptions.
 */
export function connectInvalidationBridge(
  client: QueryClient,
  registry: InvalidationRegistry,
  events: RuntimeEventSource,
): () => void {
  const unsubscribes = [...registry.entries()].map(([eventName, queryKeys]) =>
    events.subscribe(eventName, () => {
      queryKeys.forEach((queryKey) => void client.invalidateQueries({ queryKey }));
    }),
  );

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}
