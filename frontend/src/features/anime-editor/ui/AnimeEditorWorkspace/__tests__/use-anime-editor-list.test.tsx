import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorSource } from '../../../../../shared/contracts/anime-editor-source.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
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
  const { wrapper: QueryWrapper } = createModulesTestWrapper(anime);
  return function RouteWrapper({ children }: { readonly children: ReactNode }) {
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
  };
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
