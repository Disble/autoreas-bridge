import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncList } from '..';

describe('useAsyncList', () => {
  it('exposes loaded items and clears the loading state', async () => {
    const load = vi.fn().mockResolvedValue(['one', 'two']);
    const { result } = renderHook(() => useAsyncList(load));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual(['one', 'two']);
  });

  it('degrades a rejected request to an empty list', async () => {
    const load = vi.fn().mockRejectedValue(new Error('runtime unavailable'));
    const { result } = renderHook(() => useAsyncList(load));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
  });

  it('reloads when the refresh key or explicit reload changes', async () => {
    const load = vi.fn().mockResolvedValue(['initial']);
    const { result, rerender } = renderHook(({ refreshKey }) => useAsyncList(load, refreshKey), {
      initialProps: { refreshKey: 0 },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    load.mockResolvedValue(['updated']);
    rerender({ refreshKey: 1 });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['updated']));

    load.mockResolvedValue(['reloaded']);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual(['reloaded']));
  });

  it('marks loading immediately when the source key changes', async () => {
    const load = vi.fn().mockResolvedValue(['initial']);
    const { result, rerender } = renderHook(({ sourceKey }) => useAsyncList(load, undefined, sourceKey), {
      initialProps: { sourceKey: 'catalog' },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    load.mockResolvedValue(['history']);
    rerender({ sourceKey: 'history' });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['history']));
  });
});
