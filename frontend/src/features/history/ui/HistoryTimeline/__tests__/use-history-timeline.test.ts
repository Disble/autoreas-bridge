import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { WatchHistoryEntry, WatchHistoryPage } from '../../../../../shared/contracts/anime.types';
import { useHistoryTimeline } from '../use-history-timeline';

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<WatchHistoryEntry>): WatchHistoryEntry {
  return {
    id: 1,
    animeId: 'anime-1',
    animeName: 'Frieren',
    episode: 1,
    cycle: 1,
    watchedAtMs: new Date(2026, 8, 12, 12, 0, 0).getTime(),
    source: 'desktop',
    ...overrides,
  };
}

/** Builds a successful WatchHistoryPage fixture, overriding only what a case needs. */
function page(overrides: Partial<WatchHistoryPage>): WatchHistoryPage {
  return { items: [], status: 'ok', ...overrides };
}

/** Minimal BridgeRuntimeSource stub exposing only the watch-history page binding under test; omit it to test the missing-binding path. */
function createSource(getWatchHistoryPage?: BridgeRuntimeSource['getWatchHistoryPage']): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn(),
    getAnimeDetail: vi.fn(),
    getAnimeHistory: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    getWatchHistoryPage,
  };
}

describe('useHistoryTimeline', () => {
  it('starts loading with no groups, then fetches the first page with an empty cursor and groups the result by day', async () => {
    const getWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getWatchHistoryPage);
    const { result } = renderHook(() => useHistoryTimeline(source));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.groups).toEqual([]);
    expect(result.current.hasMore).toBe(false);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getWatchHistoryPage).toHaveBeenCalledWith('');
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0]?.entries).toHaveLength(1);
  });

  it.each([
    ['a nextCursor is present', '100:2', true],
    ['no nextCursor is present', undefined, false],
  ])('reports hasMore correctly when %s', async (_label, nextCursor, expected) => {
    const source = createSource(vi.fn().mockResolvedValue(page({ items: [entry({})], nextCursor })));
    const { result } = renderHook(() => useHistoryTimeline(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasMore).toBe(expected);
  });

  it('accumulates a second page fetched by fetchNextPage using the previous nextCursor', async () => {
    const getWatchHistoryPage = vi
      .fn()
      .mockResolvedValueOnce(
        page({ items: [entry({ id: 2, watchedAtMs: new Date(2026, 8, 12, 20, 0, 0).getTime() })], nextCursor: '100:2' }),
      )
      .mockResolvedValueOnce(page({ items: [entry({ id: 1, watchedAtMs: new Date(2026, 8, 12, 8, 0, 0).getTime() })] }));
    const source = createSource(getWatchHistoryPage);
    const { result } = renderHook(() => useHistoryTimeline(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => expect(getWatchHistoryPage).toHaveBeenCalledTimes(2));
    expect(getWatchHistoryPage).toHaveBeenNthCalledWith(2, '100:2');
    await waitFor(() => expect(result.current.groups[0]?.entries).toHaveLength(2));
  });

  it('does not fetch a next page when there is none', async () => {
    const getWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getWatchHistoryPage);
    const { result } = renderHook(() => useHistoryTimeline(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.fetchNextPage();
    });

    expect(getWatchHistoryPage).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error, rather than degrading to an empty result, when the first page fails', async () => {
    const source = createSource(vi.fn().mockResolvedValue(page({ status: 'error', message: 'boom' })));
    const { result } = renderHook(() => useHistoryTimeline(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual(new Error('boom'));
    expect(result.current.groups).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('surfaces an error, rather than throwing, when the source has no getWatchHistoryPage binding', async () => {
    const source = createSource();
    const { result } = renderHook(() => useHistoryTimeline(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual(new Error('Watch history request failed'));
    expect(result.current.groups).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('does not retry a stale cursor once a next-page fetch fails: hasMore, not the cursor alone, gates fetchNextPage', async () => {
    const getWatchHistoryPage = vi
      .fn()
      .mockResolvedValueOnce(page({ items: [entry({})], nextCursor: '100:2' }))
      .mockResolvedValueOnce(page({ status: 'error', message: 'boom' }));
    const source = createSource(getWatchHistoryPage);
    const { result } = renderHook(() => useHistoryTimeline(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(getWatchHistoryPage).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.fetchNextPage();
    });

    expect(getWatchHistoryPage).toHaveBeenCalledTimes(2);
  });

  it('reloads the first page when the source changes, replacing rather than appending to the prior page', async () => {
    const sourceA = createSource(vi.fn().mockResolvedValue(page({ items: [entry({ id: 1 })] })));
    const sourceB = createSource(vi.fn().mockResolvedValue(page({ items: [entry({ id: 2 })] })));
    const { result, rerender } = renderHook(({ source }) => useHistoryTimeline(source), {
      initialProps: { source: sourceA },
    });

    await waitFor(() => expect(result.current.groups[0]?.entries).toHaveLength(1));

    rerender({ source: sourceB });

    await waitFor(() => expect(result.current.groups[0]?.entries[0]?.id).toBe(2));
    expect(result.current.groups[0]?.entries).toHaveLength(1);
  });

  it('fetches the next page on a near-bottom onScroll, does nothing when not near the bottom, and never double-fetches a scroll burst while the page is in flight', async () => {
    let resolveNextPage!: (value: WatchHistoryPage) => void;
    const nextPage = new Promise<WatchHistoryPage>((resolve) => {
      resolveNextPage = resolve;
    });
    const getWatchHistoryPage = vi
      .fn()
      .mockResolvedValueOnce(page({ items: [entry({ id: 1 })], nextCursor: '100:2' }))
      .mockReturnValueOnce(nextPage);
    const source = createSource(getWatchHistoryPage);
    const { result } = renderHook(() => useHistoryTimeline(source));
    const nearBottom = { currentTarget: { scrollTop: 1700, clientHeight: 400, scrollHeight: 2000 } } as never;

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onScroll({ currentTarget: { scrollTop: 0, clientHeight: 400, scrollHeight: 2000 } } as never);
    });

    expect(getWatchHistoryPage).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onScroll(nearBottom);
    });

    await waitFor(() => expect(getWatchHistoryPage).toHaveBeenCalledTimes(2));
    expect(getWatchHistoryPage).toHaveBeenNthCalledWith(2, '100:2');

    // A scroll burst while the second page is still unresolved must not trigger a duplicate fetch.
    act(() => {
      result.current.onScroll(nearBottom);
    });
    act(() => {
      result.current.onScroll(nearBottom);
    });

    expect(getWatchHistoryPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveNextPage(page({ items: [entry({ id: 2 })] }));
      await nextPage;
    });

    expect(getWatchHistoryPage).toHaveBeenCalledTimes(2);
    expect(result.current.groups[0]?.entries).toHaveLength(2);
  });
});
