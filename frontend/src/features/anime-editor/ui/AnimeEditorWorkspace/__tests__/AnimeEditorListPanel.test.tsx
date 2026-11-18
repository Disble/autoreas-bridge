import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeEditorSource } from '../../../../../shared/contracts/anime-editor-source.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { ANIME_CHANGED_EVENT_NAME } from '../../../../../infrastructure/anime-runtime-source/anime-runtime-source.constants';
import { connectBridgeEvents, createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { flush, status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { useAnimeEditorList } from '../use-anime-editor-list';

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

vi.mock('../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The workspace's default anime-module Editor port: the same fake. */
  get BRIDGE_ANIME_EDITOR_SOURCE() {
    return mockSource;
  },
  /** The workspace's default shell pickers: the same fake. */
  get BRIDGE_PICKER_SOURCE() {
    return mockSource;
  },
  /** The workspace's default anime-module cover port: the same fake. */
  get BRIDGE_ANIME_SOURCE() {
    return mockSource;
  },
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';
import { createEmptyEpisodeDurationSource, createEpisodesReadyWrapper } from './episode-duration-source.test-support';

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
  { wrapper: createEpisodesReadyWrapper() },
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
    expect(document.querySelector('img[aria-hidden="true"]')).toBeNull();
    expect(document.querySelector('[data-airis-icon="filtered"]')).not.toBeNull();
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
    // The Schedule card reads on its own. Leaving that read pending holds its
    // loading region on screen beside the resolved rail, so the rule below is
    // the rail's own loading state -- not "no status region in the workspace",
    // which no card can promise while a sibling read is still in flight.
    mockSource.getAnimeEditorScheduleBoard.mockReturnValueOnce(new Promise(() => undefined));

    renderWorkspace();

    await screen.findByText('Frieren');
    expect(await screen.findByRole('status', { name: 'Loading the week schedule' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading anime list...' })).toBeNull();
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

describe('AnimeEditorListPanel filters', () => {
  const PAUSED_MOVIE = { id: 'anime-2', name: 'Kimi no Na wa', status: 3, kind: 1, active: 1, episodesWatched: 1, days: [] };

  it('narrows the rail to the picked status and counts the active filters', async () => {
    mockSource.getAnimes.mockResolvedValue([SCHEDULED_ANIME, PAUSED_MOVIE]);
    renderWorkspace();
    await screen.findByText('Frieren');
    fireEvent.click(screen.getByRole('radio', { name: 'All anime' }));
    await screen.findByText('Kimi no Na wa');

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(await screen.findByRole('row', { name: 'En pausa' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 anime' }));

    await waitFor(() => expect(screen.queryByText('Frieren')).toBeNull());
    expect(screen.getByText('Kimi no Na wa')).toBeInTheDocument();
    expect(screen.getByText('1 animes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument();
  });

  it('clears the picked status and type with the criteria recovery', async () => {
    mockSource.getAnimes.mockResolvedValue([SCHEDULED_ANIME]);
    renderWorkspace();
    await screen.findByText('Frieren');

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(await screen.findByRole('row', { name: 'Película' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show 0 anime' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear search and filters' }));

    await waitFor(() => expect(screen.getByText('Frieren')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });
});

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
