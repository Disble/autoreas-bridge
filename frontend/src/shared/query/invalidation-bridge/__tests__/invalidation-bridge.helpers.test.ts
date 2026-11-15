import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type { RuntimeEventSource } from '../invalidation-bridge.types';
import { connectInvalidationBridge, createInvalidationRegistry } from '../invalidation-bridge.helpers';

/** An in-memory event source; `emit` fires one event, `active` lists live subscriptions. */
function fakeEventSource() {
  const listeners = new Map<string, Set<() => void>>();
  const source: RuntimeEventSource = {
    subscribe: (eventName, listener) => {
      const set = listeners.get(eventName) ?? new Set();
      set.add(listener);
      listeners.set(eventName, set);
      return () => set.delete(listener);
    },
  };

  return {
    source,
    emit: (eventName: string) => listeners.get(eventName)?.forEach((listener) => listener()),
    active: () => [...listeners.entries()].filter(([, set]) => set.size > 0).map(([eventName]) => eventName),
  };
}

/** A client caching one query under each key. */
function clientWith(...keys: (readonly unknown[])[]): QueryClient {
  const client = new QueryClient();
  keys.forEach((key) => client.setQueryData(key, ['row']));
  return client;
}

/** Whether the query cached under `key` is invalidated. */
function isInvalidated(client: QueryClient, key: readonly unknown[]): boolean | undefined {
  return client.getQueryState(key)?.isInvalidated;
}

describe('createInvalidationRegistry', () => {
  it('merges the rules of every context by event name, in rule order', () => {
    const registry = createInvalidationRegistry([
      { event: 'anime.changed', queryKeys: [['anime']] },
      { event: 'episodes.changed', queryKeys: [['episodes']] },
      { event: 'anime.changed', queryKeys: [['episodes'], ['season']] },
    ]);

    expect([...registry.entries()]).toEqual([
      ['anime.changed', [['anime'], ['episodes'], ['season']]],
      ['episodes.changed', [['episodes']]],
    ]);
  });

  it('starts empty when no context registers', () => {
    expect(createInvalidationRegistry([]).size).toBe(0);
  });
});

describe('connectInvalidationBridge', () => {
  it('invalidates every prefix mapped to the emitted event and nothing else', async () => {
    const events = fakeEventSource();
    const client = clientWith(['anime', 'list'], ['episodes', 'schedule', 'monday'], ['season', 'current']);
    connectInvalidationBridge(client, createInvalidationRegistry([{ event: 'anime.changed', queryKeys: [['anime'], ['episodes']] }]), events.source);

    events.emit('anime.changed');
    await Promise.resolve();

    expect(isInvalidated(client, ['anime', 'list'])).toBe(true);
    expect(isInvalidated(client, ['episodes', 'schedule', 'monday'])).toBe(true);
    expect(isInvalidated(client, ['season', 'current'])).toBe(false);
  });

  it('subscribes once per event name and releases every subscription on disconnect', () => {
    const events = fakeEventSource();
    const registry = createInvalidationRegistry([
      { event: 'anime.changed', queryKeys: [['anime']] },
      { event: 'episodes.changed', queryKeys: [['episodes']] },
    ]);

    const disconnect = connectInvalidationBridge(new QueryClient(), registry, events.source);
    expect(events.active()).toEqual(['anime.changed', 'episodes.changed']);

    disconnect();
    expect(events.active()).toEqual([]);
  });
});
