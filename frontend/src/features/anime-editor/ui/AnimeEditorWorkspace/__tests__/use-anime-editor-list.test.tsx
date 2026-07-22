import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { useAnimeEditorList } from '../use-anime-editor-list';

function makeAnime(id: string, name: string) {
  return { id, name, status: 0, active: 1, episodesWatched: 1 } as unknown as never;
}

function createSource(): AnimeEditorRuntimeSource {
  return {
    getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha'), makeAnime('anime-2', 'Beta')]),
  } as unknown as AnimeEditorRuntimeSource;
}

// A route-aware wrapper so the hook's useParams() resolves the deep-link id
// exactly as it does in production (`/editor/:id`) versus the generic entry
// (`/editor`). renderHook renders its hook-runner as the Route element children.
function wrapperFor(path: string) {
  return function RouteWrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<>{children}</>} path="/editor" />
          <Route element={<>{children}</>} path="/editor/:id" />
        </Routes>
      </MemoryRouter>
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
