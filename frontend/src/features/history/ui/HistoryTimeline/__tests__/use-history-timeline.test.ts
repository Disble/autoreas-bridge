import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type {
  Anime,
  WatchHistoryEntry,
  WatchHistoryOrder,
  WatchHistoryPage,
  WatchHistoryPageRequest,
} from '../../../../../shared/contracts/anime.types';
import { useHistoryTimeline } from '../use-history-timeline';

/** Builds the still-unfiltered global page request `useHistoryTimeline` sends this unit, overriding only the cursor and order. */
function request(cursor: string, order: WatchHistoryOrder = 'newest'): WatchHistoryPageRequest {
  return { search: '', animeIds: [], watchedFromMs: 0, watchedToMs: 0, order, cursor, limit: 0 };
}

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

/** Builds a minimal catalog `Anime` fixture, overriding only what a case needs. */
function anime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: 'anime-1',
    name: 'Frieren',
    status: 0,
    episodesWatched: 1,
    active: 1,
    days: [],
    genres: [],
    hasDownloadPage: false,
    hasFolder: false,
    ...overrides,
  };
}

/**
 * Minimal BridgeRuntimeSource stub exposing the watch-history page and
 * catalog bindings under test; omit `getWatchHistoryPage` to test the
 * missing-binding path. `getAnimes` defaults to an empty, already-resolved
 * catalog so every pre-existing (unfiltered) test needs no changes of its
 * own to keep resolving past the new catalog-load step (design D2).
 */
function createSource(
  getWatchHistoryPage?: BridgeRuntimeSource['getWatchHistoryPage'],
  getAnimes: BridgeRuntimeSource['getAnimes'] = vi.fn().mockResolvedValue([]),
): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes,
    getAnimeDetail: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    getWatchHistoryPage,
  };
}

describe('useHistoryTimeline', () => {
  it('starts loading with no groups, then fetches the first page with an empty cursor and groups the result by day', async () => {
    const getWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getWatchHistoryPage);
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.groups).toEqual([]);
    expect(result.current.hasMore).toBe(false);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getWatchHistoryPage).toHaveBeenCalledWith(request(''));
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0]?.entries).toHaveLength(1);
  });

  it.each([
    ['a nextCursor is present', '100:2', true],
    ['no nextCursor is present', undefined, false],
  ])('reports hasMore correctly when %s', async (_label, nextCursor, expected) => {
    const source = createSource(vi.fn().mockResolvedValue(page({ items: [entry({})], nextCursor })));
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

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
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => expect(getWatchHistoryPage).toHaveBeenCalledTimes(2));
    expect(getWatchHistoryPage).toHaveBeenNthCalledWith(2, request('100:2'));
    await waitFor(() => expect(result.current.groups[0]?.entries).toHaveLength(2));
  });

  it('does not fetch a next page when there is none', async () => {
    const getWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getWatchHistoryPage);
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.fetchNextPage();
    });

    expect(getWatchHistoryPage).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error, rather than degrading to an empty result, when the first page fails', async () => {
    const source = createSource(vi.fn().mockResolvedValue(page({ status: 'error', message: 'boom' })));
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual(new Error('boom'));
    expect(result.current.groups).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('surfaces an error, rather than throwing, when the source has no getWatchHistoryPage binding', async () => {
    const source = createSource();
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

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
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

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

  it('resets accumulated rows and refetches from the first page when order changes (design D6 request key)', async () => {
    const getWatchHistoryPage = vi
      .fn()
      .mockResolvedValueOnce(page({ items: [entry({ id: 1 })] }))
      .mockResolvedValueOnce(page({ items: [entry({ id: 2 })] }));
    const source = createSource(getWatchHistoryPage);
    const { result, rerender } = renderHook(({ order }) => useHistoryTimeline(order, undefined, undefined, source), {
      initialProps: { order: 'newest' as WatchHistoryOrder },
    });

    await waitFor(() => expect(result.current.groups[0]?.entries).toHaveLength(1));
    expect(getWatchHistoryPage).toHaveBeenNthCalledWith(1, request('', 'newest'));

    rerender({ order: 'oldest' });

    // The reset (cleared rows, isLoading) is synchronous with the requestKey
    // change, before the new page has resolved.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.groups).toEqual([]);

    await waitFor(() => expect(getWatchHistoryPage).toHaveBeenCalledTimes(2));
    expect(getWatchHistoryPage).toHaveBeenNthCalledWith(2, request('', 'oldest'));
    await waitFor(() => expect(result.current.groups[0]?.entries[0]?.id).toBe(2));
    expect(result.current.groups[0]?.entries).toHaveLength(1);
  });

  it('drops a stale-generation response instead of appending it to a request that has since changed', async () => {
    let resolveFirstPage!: (value: WatchHistoryPage) => void;
    const firstPage = new Promise<WatchHistoryPage>((resolve) => {
      resolveFirstPage = resolve;
    });
    const getWatchHistoryPage = vi
      .fn()
      .mockReturnValueOnce(firstPage)
      .mockResolvedValueOnce(page({ items: [entry({ id: 2 })] }));
    const source = createSource(getWatchHistoryPage);
    const { result, rerender } = renderHook(({ order }) => useHistoryTimeline(order, undefined, undefined, source), {
      initialProps: { order: 'newest' as WatchHistoryOrder },
    });

    await waitFor(() => expect(getWatchHistoryPage).toHaveBeenCalledTimes(1));

    rerender({ order: 'oldest' });
    await waitFor(() => expect(result.current.groups[0]?.entries[0]?.id).toBe(2));

    await act(async () => {
      resolveFirstPage(page({ items: [entry({ id: 1 })] }));
      await firstPage;
    });

    expect(result.current.groups[0]?.entries).toHaveLength(1);
    expect(result.current.groups[0]?.entries[0]?.id).toBe(2);
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
    const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));
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
    expect(getWatchHistoryPage).toHaveBeenNthCalledWith(2, request('100:2'));

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

  describe('catalog load and Status/Type scope (design D2)', () => {
    it('loads the catalog once via getAnimes before the first watch-history page fetch', async () => {
      const getAnimes = vi.fn().mockResolvedValue([anime({})]);
      const getWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [] }));
      const source = createSource(getWatchHistoryPage, getAnimes);
      const { result } = renderHook(() => useHistoryTimeline('newest', undefined, undefined, source));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(getAnimes).toHaveBeenCalledTimes(1);
      expect(getWatchHistoryPage).toHaveBeenCalledTimes(1);
    });

    it.each<[string, number | undefined, number | undefined, readonly string[]]>([
      ['neither filter is set (all scope)', undefined, undefined, []],
      ['a Status filter narrows to the matching catalog subset (ids scope)', 0, undefined, ['a']],
    ])('sends the request built from the resolved scope when %s', async (_label, status, type, expectedAnimeIds) => {
      const getAnimes = vi.fn().mockResolvedValue([anime({ id: 'a', status: 0 }), anime({ id: 'b', status: 1 })]);
      const getWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [] }));
      const source = createSource(getWatchHistoryPage, getAnimes);
      const { result } = renderHook(() => useHistoryTimeline('newest', status, type, source));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(getWatchHistoryPage).toHaveBeenCalledWith({ ...request(''), animeIds: [...expectedAnimeIds] });
    });

    it('makes zero watch-history binding calls and resolves to the empty, non-loading state when a filter matches nothing (none scope)', async () => {
      const getAnimes = vi.fn().mockResolvedValue([anime({ id: 'a', status: 0 })]);
      const getWatchHistoryPage = vi.fn();
      const source = createSource(getWatchHistoryPage, getAnimes);
      const { result } = renderHook(() => useHistoryTimeline('newest', 3, undefined, source));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(getWatchHistoryPage).not.toHaveBeenCalled();
      expect(result.current.groups).toEqual([]);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.error).toBeUndefined();
    });
  });
});
