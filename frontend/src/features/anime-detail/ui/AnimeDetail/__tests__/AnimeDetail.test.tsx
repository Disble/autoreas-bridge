import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Stands in for the anime-detail hook so this suite asserts rendering only. */
const useAnimeDetailMock = vi.fn();

vi.mock('../use-anime-detail', () => ({
  useAnimeDetail: () => useAnimeDetailMock(),
}));

/** Stands in for the per-anime watch-episodes hook so this suite renders without a live fetch. */
const useAnimeWatchEpisodesMock = vi.fn().mockReturnValue({ entries: [], isLoading: false, hasMore: false, error: undefined, fetchNextPage: vi.fn(), onScroll: vi.fn() });

vi.mock('../../AnimeWatchHistory/use-anime-watch-episodes', () => ({
  useAnimeWatchEpisodes: () => useAnimeWatchEpisodesMock(),
}));

import { AnimeDetail } from '../AnimeDetail';

/** Baseline loaded anime-detail view model each case overrides one field of. */
function createDetailViewModel(overrides = {}) {
  return {
    id: 'anime-1',
    nombre: 'Frieren',
    modifiedAt: 1000,
    canRepeat: true,
    canRestore: false,
    hasStoredCover: false,
    estadoLabel: 'No me gusto',
    tipoLabel: 'Serie',
    subtitleLabel: 'No me gusto • Serie',
    statusLabel: 'Active',
    statusColor: 'success',
    statTiles: [
      { label: 'Watched', value: '12' },
      { label: 'Total episodes', value: '28' },
      { label: 'Duration', value: '24 min' },
    ],
    progressRatio: 43,
    paginaUrl: undefined,
    carpetaLabel: 'Unknown',
    estrenoLabel: 'Unknown',
    creacionLabel: 'Unknown',
    ultCapVistoLabel: 'Unknown',
    genres: ['Fantasy'],
    hasGenres: true,
    studios: 'Madhouse',
    origin: 'Manga',
    isFirstWatch: true,
    ...overrides,
  };
}

/** Baseline raw detail DTO feeding Watch history; repetitions stay empty so the section renders its live watch only. */
function createDetailSource(overrides = {}) {
  return {
    id: 'anime-1',
    name: 'Frieren',
    status: 0,
    episodesWatched: 12,
    totalEpisodes: 28,
    active: 1,
    days: [],
    genres: ['Fantasy'],
    firstCycle: 1,
    modified_at: 1000,
    ...overrides,
  };
}

/** Configures the mocked hook to report a fully loaded, ready-to-render state. */
function mockAnimeDetailState(overrides = {}) {
  useAnimeDetailMock.mockReturnValue({
    loadState: 'loaded',
    detail: createDetailViewModel(),
    detailSource: createDetailSource(),
    cover: { status: 'placeholder' },
    onPortadaError: vi.fn(),
    onPortadaLoad: vi.fn(),
    onBack: vi.fn(),
    onEditAnime: vi.fn(),
    confirmation: undefined,
    feedback: undefined,
    isMutating: false,
    onRequestRepeat: vi.fn(),
    onRequestRestore: vi.fn(),
    onCancelAction: vi.fn(),
    onConfirmationOpenChange: vi.fn(),
    onConfirmAction: vi.fn(),
    ...overrides,
  });
}

describe('AnimeDetail', () => {
  afterEach(() => {
    cleanup();
  });

  it('announces loading through a named status region while loadState is loading', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'loading',
      detail: undefined,
      onPortadaError: vi.fn(),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('status', { name: 'Loading anime detail...' })).toBeInTheDocument();
  });

  it('mirrors the resolved shape with placeholder tiles and field groups while loading', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'loading',
      detail: undefined,
      onPortadaError: vi.fn(),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getAllByTestId('anime-detail-skeleton-tile')).toHaveLength(3);
    expect(screen.getAllByTestId('anime-detail-skeleton-field-group')).toHaveLength(3);
  });

  it('does not render the loading status region once resolved', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.queryByRole('status', { name: 'Loading anime detail...' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('anime-detail-skeleton-tile')).not.toBeInTheDocument();
  });

  it('renders a not-found message when loadState is not-found', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'not-found',
      detail: undefined,
      onPortadaError: vi.fn(),
    });

    render(<AnimeDetail animeId="missing-id" />);

    expect(screen.getByText('Anime not found.')).toBeInTheDocument();
  });

  it('renders the hero header with título, subtitle, and status chip', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(screen.getByText('No me gusto • Serie')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders the cute-anime SVG placeholder instead of raw alt text when the cover resolved to placeholder', () => {
    mockAnimeDetailState({ cover: { status: 'placeholder' } });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.queryByRole('img', { name: 'Cover art' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cover art')).not.toBeInTheDocument();
    expect(screen.getByTestId('anime-detail-portada-placeholder')).toHaveClass('size-24');
    expect(screen.getByRole('img', { name: 'No cover art' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading cover art...' })).not.toBeInTheDocument();
  });

  it('renders a named loading region for the hero avatar while the cover resolves, without the image or the placeholder', () => {
    mockAnimeDetailState({ cover: { status: 'loading' } });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('status', { name: 'Loading cover art...' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Cover art' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('anime-detail-portada-placeholder')).not.toBeInTheDocument();
  });

  it('renders the cover image and wires onError/onLoad to the hook callbacks when the cover resolved', () => {
    const onPortadaError = vi.fn();
    const onPortadaLoad = vi.fn();
    mockAnimeDetailState({
      cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' },
      onPortadaError,
      onPortadaLoad,
    });

    render(<AnimeDetail animeId="anime-1" />);

    const image = screen.getByRole('img', { name: 'Cover art' });
    expect(image).toHaveAttribute('src', 'data:image/jpeg;base64,ZmFrZQ==');
    expect(screen.queryByTestId('anime-detail-portada-placeholder')).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading cover art...' })).not.toBeInTheDocument();

    fireEvent.error(image);
    expect(onPortadaError).toHaveBeenCalledTimes(1);

    fireEvent.load(image);
    expect(onPortadaLoad).toHaveBeenCalledTimes(1);
  });

  it('renders a back button that calls the hook onBack callback', () => {
    const onBack = vi.fn();
    mockAnimeDetailState({ onBack });

    render(<AnimeDetail animeId="anime-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders an Edit anime action that calls the hook callback', () => {
    const onEditAnime = vi.fn();
    mockAnimeDetailState({ onEditAnime });

    render(<AnimeDetail animeId="anime-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit anime' }));

    expect(onEditAnime).toHaveBeenCalledTimes(1);
  });

  it('shows Repeat and Restore only when the loaded anime is eligible', () => {
    const onRequestRepeat = vi.fn();
    const onRequestRestore = vi.fn();
    mockAnimeDetailState({
      detail: createDetailViewModel({ canRepeat: true, canRestore: true }),
      onRequestRepeat,
      onRequestRestore,
    });

    render(<AnimeDetail animeId="anime-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRequestRepeat).toHaveBeenCalledTimes(1);
    expect(onRequestRestore).toHaveBeenCalledTimes(1);
  });

  it('hides Repeat and Restore for an active watching anime', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({ canRepeat: false, canRestore: false }),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.queryByRole('button', { name: 'Repeat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('renders an explicit HeroUI confirmation whose cancel path never confirms', () => {
    const onCancelAction = vi.fn();
    const onConfirmAction = vi.fn();
    mockAnimeDetailState({
      confirmation: {
        action: 'repeat',
        heading: 'Repeat Frieren?',
        description: 'This starts a new watch cycle.',
        confirmLabel: 'Confirm Repeat',
      },
      onCancelAction,
      onConfirmAction,
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Repeat Frieren?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelAction).toHaveBeenCalledTimes(1);
    expect(onConfirmAction).not.toHaveBeenCalled();
  });

  it('delegates a confirmed action to the hook', () => {
    const onConfirmAction = vi.fn();
    mockAnimeDetailState({
      confirmation: {
        action: 'restore',
        heading: 'Restore Frieren?',
        description: 'This makes the anime active again.',
        confirmLabel: 'Confirm Restore',
      },
      onConfirmAction,
    });

    render(<AnimeDetail animeId="anime-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Restore' }));
    expect(onConfirmAction).toHaveBeenCalledTimes(1);
  });

  it('renders authoritative mutation feedback from the hook', () => {
    mockAnimeDetailState({
      feedback: {
        status: 'warning',
        title: 'Repeat not applied',
        description: 'Current version: 42. Conflict: conflict-7.',
      },
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('Repeat not applied')).toBeInTheDocument();
    expect(screen.getByText('Current version: 42. Conflict: conflict-7.')).toBeInTheDocument();
  });

  it('renders the per-episode stat tiles with explicit fallbacks', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({
        statTiles: [
          { label: 'Watched', value: '12' },
          { label: 'Total episodes', value: 'No total episodes data' },
          { label: 'Duration', value: 'No episode duration data' },
        ],
        progressRatio: undefined,
      }),
      // Unmounts Watch history so the assertion only sees the Episode-info progress bar (or its absence).
      detailSource: undefined,
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('No total episodes data')).toBeInTheDocument();
    expect(screen.getByText('No episode duration data')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders the progress bar only when the progress ratio is known', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({ progressRatio: 43 }),
      // Unmounts Watch history so the assertion only sees the Episode-info progress bar.
      detailSource: undefined,
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders página as a clickable external link when present', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({ paginaUrl: 'https://example.com/frieren' }),
    });

    render(<AnimeDetail animeId="anime-1" />);

    const link = screen.getByRole('link', { name: 'https://example.com/frieren' });
    expect(link).toHaveAttribute('href', 'https://example.com/frieren');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('renders an explicit fallback instead of a link when página is absent', () => {
    mockAnimeDetailState({ detail: createDetailViewModel({ paginaUrl: undefined }) });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('No page link available')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders general data fields (carpeta, fechas, estudios, origen, géneros)', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({
        carpetaLabel: 'D:/anime/Frieren',
        estrenoLabel: 'September 29, 2023',
        creacionLabel: 'January 1, 2023',
        ultCapVistoLabel: 'March 22, 2024',
        studios: 'Madhouse',
        origin: 'Manga',
        genres: ['Fantasy', 'Adventure'],
        hasGenres: true,
      }),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('D:/anime/Frieren')).toBeInTheDocument();
    expect(screen.getByText('September 29, 2023')).toBeInTheDocument();
    expect(screen.getByText('January 1, 2023')).toBeInTheDocument();
    expect(screen.getByText('March 22, 2024')).toBeInTheDocument();
    expect(screen.getByText('Madhouse')).toBeInTheDocument();
    expect(screen.getByText('Manga')).toBeInTheDocument();
    expect(screen.getByText('Fantasy')).toBeInTheDocument();
    expect(screen.getByText('Adventure')).toBeInTheDocument();
  });

  it('renders an explicit fallback when there are no géneros', () => {
    mockAnimeDetailState({ detail: createDetailViewModel({ genres: [], hasGenres: false }) });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('No genres listed')).toBeInTheDocument();
  });

  it('renders Watch history as the single history section, with no repetition or episode-history section', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getAllByRole('heading', { name: 'Watch history' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Repetition history' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Episode history' })).toBeNull();
    expect(screen.queryByText('No repetition history.')).toBeNull();
  });
});
