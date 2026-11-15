import { QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createInvalidationRegistry } from '../../invalidation-bridge/invalidation-bridge.helpers';
import type { RuntimeEventSource } from '../../invalidation-bridge/invalidation-bridge.types';
import type { ReadinessGate } from '../../readiness-gate/readiness-gate.types';
import { useBridgeQuery } from '../../use-bridge-query/use-bridge-query';
import { BridgeQueryProvider } from '../BridgeQueryProvider';

/** An in-memory event source counting live subscriptions per event. */
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
    live: (eventName: string) => listeners.get(eventName)?.size ?? 0,
  };
}

/** Renders the module-gated query result as text. */
function GatedProbe() {
  const query = useBridgeQuery({ queryKey: ['episodes', 'schedule'], queryFn: () => Promise.resolve('rows'), module: 'episodes' });
  return <p>{query.status}</p>;
}

describe('BridgeQueryProvider', () => {
  it('starts the gate, hands it to queries and invalidates on a registered event until unmount', async () => {
    const client = new QueryClient();
    client.setQueryData(['anime', 'list'], ['row']);
    const readinessGate: ReadinessGate = { start: vi.fn(), whenReady: vi.fn(() => Promise.resolve()) };
    const events = fakeEventSource();

    const view = render(
      <StrictMode>
        <BridgeQueryProvider
          client={client}
          readinessGate={readinessGate}
          eventSource={events.source}
          invalidations={createInvalidationRegistry([{ event: 'anime.changed', queryKeys: [['anime']] }])}
        >
          <GatedProbe />
        </BridgeQueryProvider>
      </StrictMode>,
    );

    expect(await screen.findByText('success')).toBeInTheDocument();
    expect(readinessGate.start).toHaveBeenCalled();
    expect(readinessGate.whenReady).toHaveBeenCalledWith('episodes', expect.any(AbortSignal));
    expect(events.live('anime.changed')).toBe(1);

    act(() => events.emit('anime.changed'));
    expect(client.getQueryState(['anime', 'list'])?.isInvalidated).toBe(true);

    view.unmount();
    expect(events.live('anime.changed')).toBe(0);
  });
});
