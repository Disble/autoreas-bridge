import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeSource } from '../../../../../shared/contracts/anime-source.types';
import type { AnimeWatchHistoryPageRequest, WatchHistoryEntry, WatchHistoryPage } from '../../../../../shared/contracts/anime.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { useAnimeWatchEpisodes } from '../use-anime-watch-episodes';

/** Builds the per-anime page request `useAnimeWatchEpisodes` sends, overriding only what a case needs. */
function request(animeId: string, overrides: Partial<AnimeWatchHistoryPageRequest> = {}): AnimeWatchHistoryPageRequest {
  return { animeId, cycle: 0, cursor: '', limit: 0, ...overrides };
}

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<WatchHistoryEntry> = {}): WatchHistoryEntry {
  return {
    id: 1,
    animeId: 'anime-1',
    animeName: 'Frieren',
    episode: 12,
    cycle: 1,
    watchedAtMs: new Date(2026, 8, 12, 9, 5, 0).getTime(),
    source: 'desktop',
    ...overrides,
  };
}

/** Builds a successful WatchHistoryPage fixture, overriding only what a case needs. */
function page(overrides: Partial<WatchHistoryPage> = {}): WatchHistoryPage {
  return { items: [], status: 'ok', ...overrides };
}

/** Minimal anime source exposing the anime-scoped page read under test. */
function createSource(getAnimeWatchHistoryPage: AnimeSource['getAnimeWatchHistoryPage']): AnimeSource {
  return {
    getAnimes: vi.fn(),
    getAnimeDetail: vi.fn(),
    getWatchHistoryPage: vi.fn(),
    getAnimeWatchHistoryPage,
    getAnimeCover: vi.fn(),
  };
}

/**
 * A query wrapper reporting the `anime` module, ready by default.
 * @param anime The `anime` module's readiness.
 * @returns The wrapper and `emit`, which pushes a readiness change.
 */
function modules(anime: ModuleReadiness = { module: 'anime', state: 'ready' }) {
  return createModulesTestWrapper(anime);
}

describe('useAnimeWatchEpisodes', () => {
  it('starts loading with no entries, then fetches the anime-scoped page with an empty cursor', async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 0, true, source), modules());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.entries).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getAnimeWatchHistoryPage).toHaveBeenCalledWith(request('anime-1'));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.error).toBeUndefined();
  });

  it('fetches with cycle 0 and enabled true by default, the All-episodes case', async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', source), modules());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getAnimeWatchHistoryPage).toHaveBeenCalledWith(request('anime-1', { cycle: 0 }));
  });

  it('scopes the request to the given watch cycle', async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({ cycle: 2 })] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 2, true, source), modules());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getAnimeWatchHistoryPage).toHaveBeenCalledWith(request('anime-1', { cycle: 2 }));
  });

  it('makes zero binding calls and stays idle when disabled', async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 0, false, source), modules());

    await act(async () => {});

    expect(getAnimeWatchHistoryPage).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('keeps loaded rows while collapsed and refetches on re-expand', async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAnimeWatchEpisodes('anime-1', 2, enabled, source),
      { initialProps: { enabled: true }, ...modules() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(1);
    expect(getAnimeWatchHistoryPage).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    await act(async () => {});

    expect(getAnimeWatchHistoryPage).toHaveBeenCalledTimes(1);
    expect(result.current.entries).toHaveLength(1);

    rerender({ enabled: true });
    expect(result.current.entries).toHaveLength(1);
    await waitFor(() => expect(getAnimeWatchHistoryPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('surfaces an error, rather than degrading to an empty result, when the first page fails', async () => {
    const source = createSource(vi.fn().mockRejectedValue(createBridgeError('internal', 'boom')));
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 0, true, source), modules());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual(new Error('boom'));
    expect(result.current.entries).toEqual([]);
  });

  it('stays loading without reading while the anime module starts, then shows the page once ready', async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const { wrapper, emit } = modules({ module: 'anime', state: 'starting' });
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 0, true, createSource(getAnimeWatchHistoryPage)), { wrapper });
    await act(async () => {});

    expect(result.current).toMatchObject({ isLoading: true, entries: [], error: undefined });
    expect(getAnimeWatchHistoryPage).not.toHaveBeenCalled();

    act(() => emit({ module: 'anime', state: 'ready' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('shows the failure reason, never an empty list, when the anime module failed', async () => {
    const getAnimeWatchHistoryPage = vi.fn();
    const { result } = renderHook(
      () => useAnimeWatchEpisodes('anime-1', 0, true, createSource(getAnimeWatchHistoryPage)),
      modules({ module: 'anime', state: 'failed', reason: 'anime: db closed' }),
    );

    await waitFor(() => expect(result.current.error?.message).toBe('anime: db closed'));
    expect(result.current).toMatchObject({ isLoading: false, entries: [] });
    expect(getAnimeWatchHistoryPage).not.toHaveBeenCalled();
  });

  it('shows no rows of another scope while a new cycle is collapsed', async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue(page({ items: [entry({})] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result, rerender } = renderHook(
      ({ cycle, enabled }: { cycle: number; enabled: boolean }) => useAnimeWatchEpisodes('anime-1', cycle, enabled, source),
      { initialProps: { cycle: 1, enabled: true }, ...modules() },
    );
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    rerender({ cycle: 2, enabled: false });

    expect(result.current).toMatchObject({ isLoading: false, entries: [], error: undefined });
    expect(getAnimeWatchHistoryPage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a nextCursor is present', '50:200', true],
    ['no nextCursor is present', undefined, false],
  ])('reports hasMore correctly when %s', async (_label, nextCursor, expected) => {
    const source = createSource(vi.fn().mockResolvedValue(page({ items: [entry({})], nextCursor })));
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 0, true, source), modules());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasMore).toBe(expected);
  });

  it('ignores a stale response for a previous animeId that resolves after the current one has already loaded', async () => {
    let resolveStalePage!: (value: WatchHistoryPage) => void;
    const stalePage = new Promise<WatchHistoryPage>((resolve) => {
      resolveStalePage = resolve;
    });
    const getAnimeWatchHistoryPage = vi.fn((pageRequest: AnimeWatchHistoryPageRequest) =>
      pageRequest.animeId === 'anime-1' ? stalePage : Promise.resolve(page({ items: [entry({ id: 2, animeId: 'anime-2' })] })),
    );
    const source = createSource(getAnimeWatchHistoryPage);
    const { result, rerender } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeWatchEpisodes(animeId, 0, true, source),
      { initialProps: { animeId: 'anime-1' }, ...modules() },
    );
    await waitFor(() => expect(getAnimeWatchHistoryPage).toHaveBeenCalledWith(request('anime-1')));

    rerender({ animeId: 'anime-2' });

    await waitFor(() => expect(result.current.entries).toEqual([entry({ id: 2, animeId: 'anime-2' })]));

    await act(async () => {
      resolveStalePage(page({ items: [entry({ id: 1 })] }));
      await stalePage;
    });

    expect(result.current.entries).toEqual([entry({ id: 2, animeId: 'anime-2' })]);
  });

  it('refetches with the new id, replacing rather than appending, when the animeId prop changes', async () => {
    const getAnimeWatchHistoryPage = vi
      .fn()
      .mockResolvedValueOnce(page({ items: [entry({ id: 1 })] }))
      .mockResolvedValueOnce(page({ items: [entry({ id: 2, animeId: 'anime-2' })] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result, rerender } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeWatchEpisodes(animeId, 0, true, source),
      { initialProps: { animeId: 'anime-1' }, ...modules() },
    );

    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    rerender({ animeId: 'anime-2' });

    await waitFor(() => expect(getAnimeWatchHistoryPage).toHaveBeenLastCalledWith(request('anime-2')));
    await waitFor(() => expect(result.current.entries).toEqual([entry({ id: 2, animeId: 'anime-2' })]));
  });

  it('appends the next keyset page, rather than replacing, when fetchNextPage runs', async () => {
    const getAnimeWatchHistoryPage = vi
      .fn()
      .mockResolvedValueOnce(page({ items: [entry({ id: 1 })], nextCursor: 'cursor-1' }))
      .mockResolvedValueOnce(page({ items: [entry({ id: 2 })] }));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 0, true, source), modules());

    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.entries.map((item) => item.id)).toEqual([1, 2]));
    expect(getAnimeWatchHistoryPage).toHaveBeenLastCalledWith(request('anime-1', { cursor: 'cursor-1' }));
  });

  it('keeps the rows already on screen and only stops paging when a later page fails', async () => {
    const getAnimeWatchHistoryPage = vi
      .fn()
      .mockResolvedValueOnce(page({ items: [entry({ id: 1 })], nextCursor: 'cursor-1' }))
      .mockRejectedValueOnce(createBridgeError('internal', 'later page failed'));
    const source = createSource(getAnimeWatchHistoryPage);
    const { result } = renderHook(() => useAnimeWatchEpisodes('anime-1', 0, true, source), modules());

    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.entries.map((item) => item.id)).toEqual([1]);
    expect(result.current.error).toBeUndefined();
  });
});
