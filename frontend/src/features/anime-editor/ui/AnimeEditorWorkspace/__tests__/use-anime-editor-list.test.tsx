import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorSource } from '../../../../../shared/contracts/anime-editor-source.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { ANIME_CHANGED_EVENT_NAME } from '../../../../../infrastructure/anime-runtime-source/anime-runtime-source.constants';
import { connectBridgeEvents, createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { flush, status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { useAnimeEditorList } from '../use-anime-editor-list';

/** Builds one catalog row with just the fields the rail reads. */
function makeAnime(id: string, name: string) {
  return { id, name, status: 0, active: 1, episodesWatched: 1, days: [] } as unknown as never;
}

/** A catalog read that answers two rows. */
function createSource(): Pick<AnimeEditorSource, 'getAnimes'> {
  return { getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha'), makeAnime('anime-2', 'Beta')]) };
}

/**
 * A route-aware wrapper so the hook's useParams() resolves the deep-link id
 * exactly as it does in production (`/editor/:id`) versus the generic entry
 * (`/editor`), inside a query client whose `anime` module is in `anime`.
 * renderHook renders its hook-runner as the Route element children.
 */
function wrapperFor(path: string, anime: ModuleReadiness = status('anime', 'ready')) {
  return routedModules(path, anime).wrapper;
}

/**
 * `wrapperFor` with its query client, so a test can push backend events into it.
 * @param path The route the hook renders under.
 * @param anime The `anime` module's readiness.
 * @returns The query client and the route-aware wrapper.
 */
function routedModules(path: string, anime: ModuleReadiness = status('anime', 'ready')) {
  const { client, wrapper: QueryWrapper } = createModulesTestWrapper(anime);
  return { client, wrapper: function RouteWrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryWrapper>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<>{children}</>} path="/editor" />
            <Route element={<>{children}</>} path="/editor/:id" />
          </Routes>
        </MemoryRouter>
      </QueryWrapper>
    );
  } };
}

describe('useAnimeEditorList default filter', () => {
  it('defaults to "all" when deep-linked to a specific anime (/editor/:id)', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorList({ source }), { wrapper: wrapperFor('/editor/anime-2') });

    await waitFor(() => expect(result.current.isLoadingList).toBe(false));
    expect(result.current.filter).toBe('all');
  });

  it('defaults to "watching" on the generic editor entry (/editor)', async () => {
    const source = createSource();
    const { result } = renderHook(() => useAnimeEditorList({ source }), { wrapper: wrapperFor('/editor') });

    await waitFor(() => expect(result.current.isLoadingList).toBe(false));
    expect(result.current.filter).toBe('watching');
  });
});

describe('useAnimeEditorList through the anime module', () => {
  it('stays loading with no empty state and no catalog read while the anime module starts', async () => {
    const source = { getAnimes: vi.fn().mockResolvedValue([]) };
    const { result } = renderHook(() => useAnimeEditorList({ source }), { wrapper: wrapperFor('/editor', status('anime', 'starting')) });

    await flush();

    expect(result.current.isLoadingList).toBe(true);
    expect(result.current.emptyState).toBe('none');
    expect(result.current.listLoadError).toBeUndefined();
    expect(source.getAnimes).not.toHaveBeenCalled();
  });

  it('shows the failure reason instead of an empty library once the anime module failed', async () => {
    const source = { getAnimes: vi.fn().mockResolvedValue([]) };
    const { result } = renderHook(() => useAnimeEditorList({ source }), {
      wrapper: wrapperFor('/editor', status('anime', 'failed', 'anime: open database: disk I/O error')),
    });

    await waitFor(() => expect(result.current.listLoadError).toBe('anime: open database: disk I/O error'));
    expect(result.current.isLoadingList).toBe(false);
    expect(result.current.emptyState).toBe('none');
    expect(source.getAnimes).not.toHaveBeenCalled();
  });
});

describe('useAnimeEditorList on a backend anime change', () => {
  it('keeps the loaded rail rows, never the skeleton, while an anime.changed refetch runs', async () => {
    const rows = [makeAnime('anime-1', 'Alpha'), makeAnime('anime-2', 'Beta')];
    const getAnimes = vi.fn().mockResolvedValueOnce(rows).mockReturnValueOnce(new Promise(() => {}));
    const { client, wrapper } = routedModules('/editor/anime-1');
    const { emit, disconnect } = connectBridgeEvents(client);
    const { result } = renderHook(() => useAnimeEditorList({ source: { getAnimes } }), { wrapper });
    await waitFor(() => expect(result.current.isLoadingList).toBe(false));

    emit(ANIME_CHANGED_EVENT_NAME);

    await waitFor(() => expect(getAnimes).toHaveBeenCalledTimes(2));
    expect(result.current.isLoadingList).toBe(false);
    expect(result.current.items).toHaveLength(2);
    disconnect();
  });
});
