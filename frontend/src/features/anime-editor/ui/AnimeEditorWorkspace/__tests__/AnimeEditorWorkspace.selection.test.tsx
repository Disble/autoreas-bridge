import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSource } = vi.hoisted(() => {
  function makeAnime(id: string, name: string) {
    return { id, name, status: 0, active: 1, episodesWatched: 1 };
  }
  function makeRecord(id: string, name: string) {
    return {
      animeId: id, modifiedAt: 1,
      frequent: { name, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
      details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, premieredAt: null, cover: null },
    };
  }
  const names: Record<string, string> = { 'anime-1': 'Alpha Show', 'anime-2': 'Beta Show', 'anime-3': 'Gamma Show' };
  return {
    mockSource: {
      getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha Show'), makeAnime('anime-2', 'Beta Show'), makeAnime('anime-3', 'Gamma Show')]),
      getAnimeEditorRecord: vi.fn((id: string) => Promise.resolve({ record: makeRecord(id, names[id] ?? id) })),
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

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/editor']}>
      <Routes>
        <Route element={<AnimeEditorWorkspace />} path="/editor" />
        <Route element={<AnimeEditorWorkspace />} path="/editor/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

function formName() {
  return within(screen.getByRole('heading', { level: 4 }).parentElement as HTMLElement);
}

describe('AnimeEditorWorkspace consecutive selection (integration)', () => {
  it('loads each clicked anime into the form, not just the first', async () => {
    renderWorkspace();

    // Initial auto-selection.
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Alpha Show/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Beta Show/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Beta Show/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Gamma Show/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Gamma Show/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Alpha Show/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Alpha Show/ })).toBeInTheDocument());
  });
});
