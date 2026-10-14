import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Runtime source stub, hoisted so the module mock can close over it. */
const { mockSource } = vi.hoisted(() => ({
  mockSource: {
    getAnimes: vi.fn(),
    getAnimeEditorRecord: vi.fn(),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
  },
}));

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: mockSource,
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';
import { createEmptyEpisodeDurationSource } from './episode-duration-source.test-support';

/** The Episodes section's in-memory source, so no render waits on a Wails binding. */
const episodeSource = createEmptyEpisodeDurationSource();

/** One scheduled anime, so the default "Watching now" rail shows it. */
const SCHEDULED_ANIME = { id: 'anime-1', name: 'Frieren', status: 0, active: 1, episodesWatched: 3, days: ['Lunes'] };

/** Minimal editor record for whichever anime the rail auto-selects. */
function makeRecord(id: string) {
  return {
    animeId: id,
    modifiedAt: 1,
    frequent: { name: id, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
    details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, cover: null },
  };
}

/** Mounts the workspace on the editor routes, with a probe on the Create destination. */
function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/editor']}>
      <Routes>
        <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor" />
        <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor/:id" />
        <Route element={<h2>Create workspace</h2>} path="/editor/create" />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockSource.getAnimes.mockResolvedValue([]);
  mockSource.getAnimeEditorRecord.mockImplementation((id: string) => Promise.resolve({ record: makeRecord(id) }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AnimeEditorListPanel empty states', () => {
  it('offers creation, and never criteria recovery, when the library source resolved with no anime', async () => {
    mockSource.getAnimes.mockResolvedValue([]);

    renderWorkspace();

    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
    expect(screen.getByText('No anime are stored yet. Create one to start building your library.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create an anime' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search and filters' })).toBeNull();
  });

  it('navigates to the Create workspace from the actual-empty library', async () => {
    mockSource.getAnimes.mockResolvedValue([]);

    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: 'Create an anime' }));

    expect(await screen.findByRole('heading', { name: 'Create workspace' })).toBeInTheDocument();
  });

  it('offers criteria recovery, and never creation, when a search hides every stored anime', async () => {
    mockSource.getAnimes.mockResolvedValue([SCHEDULED_ANIME]);

    renderWorkspace();

    await screen.findByText('Frieren');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search anime editor list' }), { target: { value: 'nothing-matches-this' } });

    expect(await screen.findByText('No anime match your criteria')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search and filters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create an anime' })).toBeNull();
    expect(screen.queryByText('Your library is empty')).toBeNull();
  });

  it('restores the library defaults when criteria recovery is used', async () => {
    mockSource.getAnimes.mockResolvedValue([SCHEDULED_ANIME]);

    renderWorkspace();

    await screen.findByText('Frieren');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search anime editor list' }), { target: { value: 'nothing-matches-this' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear search and filters' }));

    await waitFor(() => expect(screen.getByText('Frieren')).toBeInTheDocument());
    expect(screen.getByRole('radio', { name: 'All anime' })).toBeChecked();
  });

  it('shows neither empty state while the library request is unresolved', async () => {
    mockSource.getAnimes.mockReturnValue(new Promise(() => undefined));

    renderWorkspace();

    expect(await screen.findByRole('status', { name: 'Loading anime list...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create an anime' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear search and filters' })).toBeNull();
  });

  it('renders exactly six placeholder rows while the library request is unresolved', async () => {
    mockSource.getAnimes.mockReturnValue(new Promise(() => undefined));

    renderWorkspace();

    await screen.findByRole('status', { name: 'Loading anime list...' });
    expect(screen.getAllByTestId('anime-editor-skeleton-row')).toHaveLength(6);
    // Each placeholder row carries the same 44px cover slot a real row does,
    // so the rail does not jump when the covers arrive.
    expect(screen.getAllByTestId('anime-editor-skeleton-cover')).toHaveLength(6);
    // jsdom has no layout engine, so the class string IS the horizontal layout
    // contract: the placeholder row is a flex row like the real row it mirrors.
    expect(screen.getAllByTestId('anime-editor-skeleton-row')[0]).toHaveClass('flex', 'items-center', 'gap-2');
  });

  it('renders the shared placeholder, and asks for nothing, for a row with no cover', async () => {
    mockSource.getAnimes.mockResolvedValue([SCHEDULED_ANIME]);

    renderWorkspace();

    await screen.findByText('Frieren');
    expect(screen.getByTestId('anime-editor-list-cover-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('anime-editor-list-cover-image')).toBeNull();
    expect(mockSource.getAnimeCover).not.toHaveBeenCalled();
  });

  it('renders no status region and no placeholder once the library request resolved', async () => {
    mockSource.getAnimes.mockResolvedValue([SCHEDULED_ANIME]);

    renderWorkspace();

    await screen.findByText('Frieren');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('anime-editor-skeleton-row')).toBeNull();
  });

  it('renders no rail row while a post-deactivate reload keeps the anime that was just there', async () => {
    // The first getAnimes() call resolves with Frieren, exactly like every
    // other case here. A confirmed deactivate reloads the rail (loadItems),
    // and that second getAnimes() call never resolves: isLoadingList flips
    // back to true while `items` still holds Frieren from the completed
    // first load. That is the real refetch state the shipped bug rendered
    // a skeleton over a real row in.
    mockSource.getAnimes.mockResolvedValueOnce([SCHEDULED_ANIME]).mockReturnValue(new Promise(() => undefined));
    mockSource.deactivateAnime.mockResolvedValue({ outcome: 'applied', message: 'Deactivated.' });

    renderWorkspace();

    await screen.findByText('Frieren');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deactivate anime' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate anime' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));

    await screen.findByRole('status', { name: 'Loading anime list...' });
    expect(screen.queryByRole('button', { name: /Frieren/ })).toBeNull();
    expect(screen.queryByTestId('anime-editor-list-scroll')).toBeNull();
  });
});
