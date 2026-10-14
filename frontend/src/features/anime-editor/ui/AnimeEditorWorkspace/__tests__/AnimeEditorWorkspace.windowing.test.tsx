import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Mock source the editor workspace receives through the vi.mock factory.
 * 150 animes is past the ~100-row progressive-list threshold and well above
 * the 60 rows two scrolls reach; a full 842-item catalog only added render
 * cost that pushed the test past its 5s budget inside the mutation runner.
 */
const { mockSource } = vi.hoisted(() => {
  const animes = Array.from({ length: 150 }, (_, index) => ({
    id: `anime-${index}`, name: `Anime ${String(index).padStart(4, '0')}`, status: 0, active: 1, episodesWatched: index, days: ['Lunes'],
  }));
  function makeRecord(id: string) {
    return {
      animeId: id, modifiedAt: 1,
      frequent: { name: id, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
      details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, cover: null },
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
import { createEmptyEpisodeDurationSource } from './episode-duration-source.test-support';

/** The Episodes section's in-memory source, so no render waits on a Wails binding. */
const episodeSource = createEmptyEpisodeDurationSource();

afterEach(cleanup);

/** Counts the rendered list rows for the progressive-list assertions. */
function countRows() {
  return screen.getAllByRole('button', { name: /watched/ }).length;
}

describe('AnimeEditorWorkspace progressive list (150 items)', () => {
  it('renders only the first batch initially, then grows on scroll — never the whole catalog at once', async () => {
    render(
      <MemoryRouter initialEntries={['/editor']}>
        <Routes>
          <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor" />
          <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor/:id" />
        </Routes>
      </MemoryRouter>,
    );

    // The chip reports the true total (150) — but the DOM must NOT hold 150 rows.
    await waitFor(() => expect(screen.getByText('150 animes')).toBeInTheDocument());

    const initialRows = countRows();
    expect(initialRows).toBe(20); // ANIME_EDITOR_LIST_INITIAL_COUNT

    // Scrolling near the bottom appends the next batch (progressive load).
    fireEvent.scroll(screen.getByTestId('anime-editor-list-scroll'));
    await waitFor(() => expect(countRows()).toBe(40));

    fireEvent.scroll(screen.getByTestId('anime-editor-list-scroll'));
    await waitFor(() => expect(countRows()).toBe(60));

    // Still far below the full catalog after two scrolls.
    expect(countRows()).toBeLessThan(150);
  });
});
