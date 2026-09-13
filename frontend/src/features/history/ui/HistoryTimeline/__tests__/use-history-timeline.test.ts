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

/** Minimal BridgeRuntimeSource stub exposing only the watch-history page binding under test. */
function createSource(getWatchHistoryPage: NonNullable<BridgeRuntimeSource['getWatchHistoryPage']>): BridgeRuntimeSource {
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

  it('degrades to an empty result without throwing when the page status is not ok', async () => {
    const source = createSource(vi.fn().mockResolvedValue(page({ status: 'error', message: 'boom' })));
    const { result } = renderHook(() => useHistoryTimeline(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.groups).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });
});
