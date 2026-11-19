import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModuleReadiness, ReadinessSource } from '../../../contracts/readiness.types';
import { createBridgeError } from '../../bridge-error/bridge-error.helpers';
import { createReadinessGate } from '../../readiness-gate/readiness-gate.helpers';
import { createBridgeQueryTestWrapper } from '../../test-support/bridge-query.test-support';
import { useBridgeQuery } from '../use-bridge-query';

/** A readiness source answering `snapshot`; `emit` pushes a later transition. */
function readinessSource(...snapshot: ModuleReadiness[]) {
  const listeners = new Set<(status: ModuleReadiness) => void>();
  const source: ReadinessSource = {
    getReadiness: () => Promise.resolve(snapshot),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, emit: (status: ModuleReadiness) => listeners.forEach((listener) => listener(status)) };
}

describe('useBridgeQuery', () => {
  it('stays pending without calling the binding while its module starts, then runs once it is ready', async () => {
    const readiness = readinessSource({ module: 'episodes', state: 'starting' });
    const queryFn = vi.fn(() => Promise.resolve(['row']));
    const { wrapper } = createBridgeQueryTestWrapper({ readinessGate: createReadinessGate(readiness.source) });

    const { result } = renderHook(() => useBridgeQuery({ queryKey: ['episodes', 'schedule'], queryFn, module: 'episodes' }), { wrapper });
    await act(() => Promise.resolve());

    expect(result.current.status).toBe('pending');
    expect(queryFn).not.toHaveBeenCalled();

    act(() => readiness.emit({ module: 'episodes', state: 'ready' }));

    await waitFor(() => expect(result.current.data).toEqual(['row']));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('fails with failed_precondition and never calls the binding when its module failed', async () => {
    const readiness = readinessSource({ module: 'episodes', state: 'failed', reason: 'episodes: db closed' });
    const queryFn = vi.fn(() => Promise.resolve(['row']));
    const { wrapper } = createBridgeQueryTestWrapper({ readinessGate: createReadinessGate(readiness.source) });

    const { result } = renderHook(() => useBridgeQuery({ queryKey: ['episodes', 'schedule'], queryFn, module: 'episodes' }), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatchObject({ code: 'failed_precondition', message: 'episodes: db closed' });
    expect(result.current.failureCount).toBe(1);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('does not retry a coded failure other than unavailable', async () => {
    const queryFn = vi.fn(() => Promise.reject(createBridgeError('not_found', 'gone')));
    const { wrapper } = createBridgeQueryTestWrapper();

    const { result } = renderHook(() => useBridgeQuery({ queryKey: ['anime', 'a-1'], queryFn }), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('runs an ungated query at once with the abort signal, then keeps its data while the next key loads', async () => {
    let resolveMonday: (rows: string[]) => void = () => undefined;
    const queryFn = vi.fn((context: { signal: AbortSignal }) =>
      queryFn.mock.calls.length === 1
        ? Promise.resolve(context.signal instanceof AbortSignal ? ['sunday row'] : [])
        : new Promise<string[]>((resolve) => (resolveMonday = resolve)),
    );
    const { wrapper } = createBridgeQueryTestWrapper();

    const { result, rerender } = renderHook(({ day }) => useBridgeQuery({ queryKey: ['episodes', 'schedule', day], queryFn }), {
      wrapper,
      initialProps: { day: 'sunday' },
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(['sunday row']);

    rerender({ day: 'monday' });

    expect(result.current).toMatchObject({ status: 'success', data: ['sunday row'], isPlaceholderData: true, isFetching: true });
    act(() => resolveMonday(['monday row']));
    await waitFor(() => expect(result.current).toMatchObject({ data: ['monday row'], isPlaceholderData: false }));
  });
});
