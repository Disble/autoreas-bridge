import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncList } from '../use-async-list';

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

describe('useAsyncList error lifecycle', () => {
  it('exposes the rejection reason while still settling with an empty list', async () => {
    const load = vi.fn().mockRejectedValue(new Error('runtime unavailable'));
    const { result } = renderHook(() => useAsyncList(load));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('runtime unavailable');
    expect(result.current.items).toEqual([]);
  });

  it('normalizes a non-Error rejection into an Error', async () => {
    const load = vi.fn().mockRejectedValue('binding missing');
    const { result } = renderHook(() => useAsyncList(load));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('binding missing');
  });

  it('reports no error for a successful request', async () => {
    const load = vi.fn().mockResolvedValue(['one']);
    const { result } = renderHook(() => useAsyncList(load));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeUndefined();
  });

  it('clears a previous error as soon as an explicit reload starts', async () => {
    const load = vi.fn().mockRejectedValue(new Error('runtime unavailable'));
    const { result } = renderHook(() => useAsyncList(load));

    await waitFor(() => expect(result.current.error?.message).toBe('runtime unavailable'));

    load.mockReturnValue(new Promise(() => undefined));
    act(() => result.current.reload());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('clears a previous error when the source key starts a fresh request', async () => {
    const load = vi.fn().mockRejectedValue(new Error('runtime unavailable'));
    const { result, rerender } = renderHook(({ sourceKey }) => useAsyncList(load, undefined, sourceKey), {
      initialProps: { sourceKey: 'catalog' },
    });

    await waitFor(() => expect(result.current.error?.message).toBe('runtime unavailable'));

    load.mockResolvedValue(['history']);
    rerender({ sourceKey: 'history' });

    expect(result.current.error).toBeUndefined();
    await waitFor(() => expect(result.current.items).toEqual(['history']));
    expect(result.current.error).toBeUndefined();
  });

  it('ignores a cancelled request that rejects after a newer one succeeded', async () => {
    let rejectStale: (reason: Error) => void = () => undefined;
    const load = vi.fn().mockImplementation(() => new Promise<readonly string[]>((_resolve, reject) => {
      rejectStale = reject;
    }));
    const { result, rerender } = renderHook(({ sourceKey }) => useAsyncList(load, undefined, sourceKey), {
      initialProps: { sourceKey: 'catalog' },
    });

    load.mockResolvedValue(['history']);
    rerender({ sourceKey: 'history' });
    await waitFor(() => expect(result.current.items).toEqual(['history']));

    await act(async () => {
      rejectStale(new Error('stale rejection'));
      await Promise.resolve();
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.items).toEqual(['history']);
  });
});
