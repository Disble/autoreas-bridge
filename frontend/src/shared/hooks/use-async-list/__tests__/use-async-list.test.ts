import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncList } from '../use-async-list';

describe('useAsyncList', () => {
  it('loads items with no error, then reloads on a refresh key, an explicit reload and a source key', async () => {
    const load = vi.fn().mockResolvedValue(['one', 'two']);
    const { result, rerender } = renderHook(({ refreshKey, sourceKey }) => useAsyncList(load, refreshKey, sourceKey), {
      initialProps: { refreshKey: 0, sourceKey: 'catalog' },
    });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual(['one', 'two']);
    expect(result.current.error).toBeUndefined();

    load.mockResolvedValue(['updated']);
    rerender({ refreshKey: 1, sourceKey: 'catalog' });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['updated']));

    load.mockResolvedValue(['reloaded']);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual(['reloaded']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    load.mockResolvedValue(['history']);
    rerender({ refreshKey: 1, sourceKey: 'history' });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['history']));
  });
});

describe('useAsyncList error lifecycle', () => {
  it('settles a rejection to an empty list with its reason, normalizes a non-Error one, and clears it on reload', async () => {
    const load = vi.fn().mockRejectedValue(new Error('runtime unavailable'));
    const { result } = renderHook(() => useAsyncList(load));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('runtime unavailable');
    expect(result.current.items).toEqual([]);

    load.mockRejectedValue('binding missing');
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error?.message).toBe('binding missing'));

    expect(result.current.error).toBeInstanceOf(Error);

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
