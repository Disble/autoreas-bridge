import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createBridgeError } from '../../bridge-error/bridge-error.helpers';
import { createBridgeQueryTestWrapper } from '../../test-support/bridge-query.test-support';
import { useBridgeMutation } from '../use-bridge-mutation';

describe('useBridgeMutation', () => {
  it('runs the mutation with its variables and exposes the result', async () => {
    const mutationFn = vi.fn((day: string) => Promise.resolve({ outcome: 'applied', day }));
    const { wrapper } = createBridgeQueryTestWrapper();

    const { result } = renderHook(() => useBridgeMutation({ mutationFn }), { wrapper });
    act(() => result.current.mutate('monday'));

    await waitFor(() => expect(result.current.data).toEqual({ outcome: 'applied', day: 'monday' }));
  });

  it('never retries, even an unavailable failure under a client that would', async () => {
    const mutationFn = vi.fn(() => Promise.reject(createBridgeError('unavailable', 'starting')));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: 3, retryDelay: 0 } } });
    const { wrapper } = createBridgeQueryTestWrapper({ client });

    const { result } = renderHook(() => useBridgeMutation({ mutationFn }), { wrapper });
    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatchObject({ code: 'unavailable' });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});
