import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('BridgeDataProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('wires the Wails readiness adapter: a gated query waits for its module, then runs once', async () => {
    const calls: string[] = [];
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn((eventName: string, callback: (payload: unknown) => void) => {
        calls.push(`listen:${eventName}`);
        handlers.set(eventName, callback);
        return () => handlers.delete(eventName);
      }),
    } as never;
    window.go = {
      desktop: {
        App: {
          GetReadiness: vi.fn(() => {
            calls.push('GetReadiness');
            return Promise.resolve({ modules: [{ module: 'episodes', state: 'starting' }] });
          }),
        },
      },
    } as never;
    const { BridgeDataProvider } = await import('../BridgeDataProvider');
    const { useBridgeQuery } = await import('../../../shared/query/use-bridge-query/use-bridge-query');
    const queryFn = vi.fn(() => Promise.resolve('rows'));

    /** Renders the gated query's status. */
    function Probe() {
      return <p>{useBridgeQuery({ queryKey: ['episodes', 'schedule'], queryFn, module: 'episodes' }).status}</p>;
    }

    render(
      <StrictMode>
        <BridgeDataProvider>
          <Probe />
        </BridgeDataProvider>
      </StrictMode>,
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.getByText('pending')).toBeInTheDocument();
    // One listener each, StrictMode included: readiness first, then the invalidation rules (`anime.changed`, then the two Devices events).
    expect(calls).toEqual(['listen:bridge.readiness', 'GetReadiness', 'listen:anime.changed', 'listen:pairing.token-consumed', 'listen:sync.device_acknowledged']);
    expect(queryFn).not.toHaveBeenCalled();

    act(() => handlers.get('bridge.readiness')?.({ module: 'episodes', state: 'ready' }));

    expect(await screen.findByText('success')).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
