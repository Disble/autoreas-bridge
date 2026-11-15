import { QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ModuleReadiness } from '../../../contracts/readiness.types';
import { createBridgeError } from '../../bridge-error/bridge-error.helpers';
import { createInvalidationRegistry } from '../../invalidation-bridge/invalidation-bridge.helpers';
import type { RuntimeEventSource } from '../../invalidation-bridge/invalidation-bridge.types';
import { createReadinessGate } from '../../readiness-gate/readiness-gate.helpers';
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

/** Props of `GatedProbe`. */
interface GatedProbeProps {
  readonly queryFn?: () => Promise<string>;
  readonly initialData?: string;
}

/** Renders the module-gated query's status and error code as text. */
function GatedProbe({ queryFn = () => Promise.resolve('rows'), initialData }: Readonly<GatedProbeProps>) {
  const query = useBridgeQuery({ queryKey: ['episodes', 'schedule'], queryFn, module: 'episodes', initialData });
  return <p>{`${query.status} ${query.error?.code ?? ''}`.trim()}</p>;
}

/**
 * A readiness source whose snapshot answers `snapshot` (default: fails with
 * `internal`); `emit` pushes a transition.
 */
function readinessSource(snapshot: () => Promise<readonly ModuleReadiness[]> = () => Promise.reject(createBridgeError('internal', 'registry gone'))) {
  const listeners = new Set<(status: ModuleReadiness) => void>();
  return {
    source: {
      getReadiness: vi.fn(snapshot),
      subscribe: (listener: (status: ModuleReadiness) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    emit: (status: ModuleReadiness) => listeners.forEach((listener) => listener(status)),
  };
}

/** Renders `GatedProbe` under a provider whose gate reads `source`. */
function renderGated(source: ReturnType<typeof readinessSource>['source'], queryFn: () => Promise<string>, initialData?: string) {
  return render(
    <BridgeQueryProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      readinessGate={createReadinessGate(source)}
      eventSource={fakeEventSource().source}
      invalidations={createInvalidationRegistry([])}
    >
      <GatedProbe queryFn={queryFn} initialData={initialData} />
    </BridgeQueryProvider>,
  );
}

describe('BridgeQueryProvider', () => {
  it('starts the gate, hands it to queries and invalidates on a registered event until unmount', async () => {
    const client = new QueryClient();
    client.setQueryData(['anime', 'list'], ['row']);
    const readinessGate: ReadinessGate = { start: vi.fn(), whenReady: vi.fn(() => Promise.resolve()), onSettled: vi.fn(() => () => undefined) };
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

  it('re-runs a query a failed snapshot left in error once its module turns ready, and only then', async () => {
    const readiness = readinessSource();
    const queryFn = vi.fn(() => Promise.resolve('rows'));
    renderGated(readiness.source, queryFn);
    expect(await screen.findByText('error internal')).toBeInTheDocument();

    const snapshotReads = readiness.source.getReadiness.mock.calls.length;
    act(() => readiness.emit({ module: 'anime', state: 'ready' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByText('error internal')).toBeInTheDocument();
    expect(readiness.source.getReadiness).toHaveBeenCalledTimes(snapshotReads);
    expect(queryFn).not.toHaveBeenCalled();

    act(() => readiness.emit({ module: 'episodes', state: 'ready' }));
    expect(await screen.findByText('success')).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('shows the module failure on a query a failed snapshot left in error once its module fails', async () => {
    const readiness = readinessSource();
    const queryFn = vi.fn(() => Promise.resolve('rows'));
    renderGated(readiness.source, queryFn);
    expect(await screen.findByText('error internal')).toBeInTheDocument();

    act(() => readiness.emit({ module: 'episodes', state: 'failed', reason: 'episodes: db closed' }));
    expect(await screen.findByText('error failed_precondition')).toBeInTheDocument();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it.each([
    ['without data', undefined, 'pending'],
    ['holding initial data', 'cached', 'success'],
  ])('runs a query still waiting %s when its module turns ready exactly once', async (_label, initialData, waitingStatus) => {
    const readiness = readinessSource(() => Promise.resolve([{ module: 'episodes', state: 'starting' }]));
    const queryFn = vi.fn(() => Promise.resolve('rows'));
    renderGated(readiness.source, queryFn, initialData);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByText(waitingStatus)).toBeInTheDocument();

    act(() => readiness.emit({ module: 'episodes', state: 'ready' }));
    expect(await screen.findByText('success')).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
