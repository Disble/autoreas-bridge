import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimeEditorRoute } from '../AnimeEditorRoute';

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/editor']}>
      <Routes>
        <Route element={<AnimeEditorRoute />} path="/editor" />
        <Route element={<AnimeEditorRoute />} path="/editor/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock('../../../infrastructure/bridge-runtime-source', () => ({
  bridgeRuntimeSource: {
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeEditorRecord: vi.fn(),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'loaded', board: { originAnimeId: '', boardModifiedAt: 0, destinations: [], entries: [] } }),
    applyAnimeEditorSchedule: vi.fn(),
    createAnime: vi.fn(),
    pickFolder: vi.fn(),
    pickFile: vi.fn(),
  },
}));

describe('AnimeEditorRoute', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the Library tab by default with a Create tab available', () => {
    renderRoute();

    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
  });

  it('opens the Create tab without a modal', () => {
    renderRoute();

    fireEvent.click(screen.getByRole('tab', { name: 'Create' }));

    expect(screen.getByRole('heading', { name: 'Create anime' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
