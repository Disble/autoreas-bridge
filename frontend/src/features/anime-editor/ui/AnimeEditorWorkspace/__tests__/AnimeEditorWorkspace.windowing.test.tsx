import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSource } = vi.hoisted(() => {
  const animes = Array.from({ length: 842 }, (_, index) => ({
    id: `anime-${index}`, name: `Anime ${String(index).padStart(4, '0')}`, status: 0, active: 1, episodesWatched: index,
  }));
  function makeRecord(id: string) {
    return {
      animeId: id, modifiedAt: 1,
      frequent: { name: id, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
      details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, premieredAt: null, cover: null },
    };
  }
  return {
    mockSource: {
      getAnimes: vi.fn().mockResolvedValue(animes),
      getAnimeEditorRecord: vi.fn((id: string) => Promise.resolve({ record: makeRecord(id) })),
      saveAnimeEditor: vi.fn(), deactivateAnime: vi.fn(), getAnimeEditorScheduleBoard: vi.fn(), applyAnimeEditorSchedule: vi.fn(),
      pickFolder: vi.fn().mockResolvedValue(''),
    },
  };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: mockSource,
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';

afterEach(cleanup);

function countRows() {
  return screen.getAllByRole('button', { name: /watched/ }).length;
}

describe('AnimeEditorWorkspace progressive list (842 items)', () => {
  it('renders only the first batch initially, then grows on scroll — never the whole catalog at once', async () => {
    render(
      <MemoryRouter initialEntries={['/editor']}>
        <Routes>
          <Route element={<AnimeEditorWorkspace />} path="/editor" />
          <Route element={<AnimeEditorWorkspace />} path="/editor/:id" />
        </Routes>
      </MemoryRouter>,
    );

    // The chip reports the true total (842) — but the DOM must NOT hold 842 rows.
    await waitFor(() => expect(screen.getByText('842 animes')).toBeInTheDocument());

    const initialRows = countRows();
    expect(initialRows).toBe(20); // ANIME_EDITOR_LIST_INITIAL_COUNT

    // Scrolling near the bottom appends the next batch (progressive load).
    fireEvent.scroll(screen.getByTestId('anime-editor-list-scroll'));
    await waitFor(() => expect(countRows()).toBe(40));

    fireEvent.scroll(screen.getByTestId('anime-editor-list-scroll'));
    await waitFor(() => expect(countRows()).toBe(60));

    // Still far below the full catalog after two scrolls.
    expect(countRows()).toBeLessThan(842);
  });
});
