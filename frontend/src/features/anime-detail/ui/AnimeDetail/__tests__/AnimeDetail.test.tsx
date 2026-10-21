import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    coverAlt: 'Cover of Frieren',
    repeatLabel: 'Repeat Frieren',
    restoreLabel: 'Restore Frieren',
    editLabel: 'Edit Frieren',
    estadoLabel: 'No me gusto',
    estadoColor: 'danger',
    tipoLabel: 'Película',
    statusLabel: 'Active',
    statusColor: 'success',
    progressCountLabel: '12 of 28 episodes',
    durationLabel: 'Duration · 24 min',
    progressRatio: 43,
    paginaUrl: undefined,
    hasFolder: false,
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
    onCopyFolder: vi.fn(),
    onOpenPage: vi.fn(),
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

/** Reports whether `later` follows `earlier` in document order. */
function follows(earlier: Element, later: Element): boolean {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
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

  it('mirrors the resolved shape with a cover frame and the General data fields while loading', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'loading',
      detail: undefined,
      onPortadaError: vi.fn(),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByTestId('anime-detail-skeleton-cover')).toHaveClass('aspect-[5/7]');
    expect(screen.getAllByTestId('anime-detail-skeleton-field')).toHaveLength(8);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('does not render the loading status region once resolved', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.queryByRole('status', { name: 'Loading anime detail...' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('anime-detail-skeleton-cover')).not.toBeInTheDocument();
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

  it('renders the name as the page h1 with the type alone, then the estado and status chips', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Frieren' })).toBeInTheDocument();
    const type = screen.getByText('Película');
    const estado = screen.getByText('No me gusto');
    expect(follows(type, estado)).toBe(true);
    expect(follows(estado, screen.getByText('Active'))).toBe(true);
    expect(screen.queryByText(/•/)).not.toBeInTheDocument();
  });

  it('fills the cover frame with the no-cover poster when the cover resolved to placeholder', () => {
    mockAnimeDetailState({ cover: { status: 'placeholder' } });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('img', { name: 'No cover' }).getAttribute('src')).toContain('no-cover');
    expect(screen.queryByRole('img', { name: 'Cover of Frieren' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading cover art...' })).not.toBeInTheDocument();
  });

  it('renders a named loading region for the cover while it resolves, without the image or the placeholder', () => {
    mockAnimeDetailState({ cover: { status: 'loading' } });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('status', { name: 'Loading cover art...' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Cover of Frieren' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'No cover' })).not.toBeInTheDocument();
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

    const image = screen.getByRole('img', { name: 'Cover of Frieren' });
    expect(image).toHaveAttribute('src', 'data:image/jpeg;base64,ZmFrZQ==');
    expect(screen.queryByRole('img', { name: 'No cover' })).not.toBeInTheDocument();
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

  it('renders an icon-only Edit action named after the anime that calls the hook callback', () => {
    const onEditAnime = vi.fn();
    mockAnimeDetailState({ onEditAnime });

    render(<AnimeDetail animeId="anime-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Frieren' }));

    expect(onEditAnime).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Edit anime')).not.toBeInTheDocument();
  });

  it('orders the toolbar Back first, then Repeat, Restore and Edit last', () => {
    mockAnimeDetailState({ detail: createDetailViewModel({ canRepeat: true, canRestore: true }) });

    render(<AnimeDetail animeId="anime-1" />);

    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(names.slice(0, 4)).toEqual(['Back', 'Repeat Frieren', 'Restore Frieren', 'Edit Frieren']);
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

    fireEvent.click(screen.getByRole('button', { name: 'Repeat Frieren' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Frieren' }));
    expect(onRequestRepeat).toHaveBeenCalledTimes(1);
    expect(onRequestRestore).toHaveBeenCalledTimes(1);
  });

  it('hides Repeat and Restore for an active watching anime', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({ canRepeat: false, canRestore: false }),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.queryByRole('button', { name: 'Repeat Frieren' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore Frieren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Frieren' })).toBeEnabled();
  });

  it('disables every toolbar action, Edit included, while a mutation runs', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({ canRepeat: true, canRestore: true }),
      isMutating: true,
    });

    render(<AnimeDetail animeId="anime-1" />);

    for (const name of ['Repeat Frieren', 'Restore Frieren', 'Edit Frieren']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
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

  it('renders one progress line with its bar, and the fallbacks without a bar when no total exists', () => {
    mockAnimeDetailState();

    const { unmount } = render(<AnimeDetail animeId="anime-1" />);

    const episodeInfo = within(screen.getByRole('region', { name: 'Episode info' }));
    expect(episodeInfo.getByText('12 of 28 episodes')).toBeInTheDocument();
    expect(episodeInfo.getByText('Duration · 24 min')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Episodes watched' })).toHaveAttribute('aria-valuenow', '43');
    expect(screen.queryByText('Total episodes')).not.toBeInTheDocument();
    unmount();

    mockAnimeDetailState({
      detail: createDetailViewModel({
        progressCountLabel: '12 episodes · No total episodes data',
        durationLabel: 'No episode duration data',
        progressRatio: undefined,
      }),
    });
    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('12 episodes · No total episodes data')).toBeInTheDocument();
    expect(screen.getByText('No episode duration data')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Episodes watched' })).not.toBeInTheDocument();
  });

  it('renders página as a keyboard-reachable link that opens through the bridge, never through an href', () => {
    const onOpenPage = vi.fn();
    mockAnimeDetailState({
      detail: createDetailViewModel({ paginaUrl: 'https://example.com/frieren' }),
      onOpenPage,
    });

    render(<AnimeDetail animeId="anime-1" />);

    const link = screen.getByRole('link', { name: 'https://example.com/frieren' });
    expect(link).not.toHaveAttribute('href');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAttribute('tabindex', '0');
    fireEvent.click(link);
    expect(onOpenPage).toHaveBeenCalledTimes(1);
  });

  it('renders Unknown instead of a link when página is absent', () => {
    mockAnimeDetailState({ detail: createDetailViewModel({ paginaUrl: undefined }) });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('Page').nextElementSibling).toHaveTextContent('Unknown');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the General data fields in order, with a copy action on Folder', () => {
    const onCopyFolder = vi.fn();
    mockAnimeDetailState({
      detail: createDetailViewModel({
        hasFolder: true,
        carpetaLabel: 'D:/anime/Frieren',
        estrenoLabel: 'September 29, 2023',
        creacionLabel: 'January 1, 2023',
        ultCapVistoLabel: 'March 22, 2024',
        studios: 'Madhouse',
        origin: 'Manga',
        genres: ['Fantasy', 'Adventure'],
        hasGenres: true,
      }),
      onCopyFolder,
    });

    render(<AnimeDetail animeId="anime-1" />);

    const section = screen.getByRole('region', { name: 'General data' });
    expect([...section.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
      'Folder', 'Page', 'Studios', 'Origin', 'First watched', 'Last episode watched', 'Creation date', 'Genres',
    ]);
    expect(screen.getByText('D:/anime/Frieren')).toBeInTheDocument();
    expect(screen.getByText('September 29, 2023')).toBeInTheDocument();
    expect(screen.getByText('January 1, 2023')).toBeInTheDocument();
    expect(screen.getByText('March 22, 2024')).toBeInTheDocument();
    expect(screen.getByText('Madhouse')).toBeInTheDocument();
    expect(screen.getByText('Manga')).toBeInTheDocument();
    expect(screen.getByText('Fantasy')).toBeInTheDocument();
    expect(screen.getByText('Adventure')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy folder path' }));
    expect(onCopyFolder).toHaveBeenCalledTimes(1);
  });

  it('renders an explicit fallback when there are no géneros, and no copy action without a folder', () => {
    mockAnimeDetailState({ detail: createDetailViewModel({ genres: [], hasGenres: false }) });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('No genres listed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy folder path' })).not.toBeInTheDocument();
  });

  it('renders Watch history as the single history section, outside the main card', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getAllByRole('heading', { name: 'Watch history' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Repetition history' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Episode history' })).toBeNull();
    expect(screen.queryByText('No repetition history.')).toBeNull();
    const mainCard = screen.getByRole('heading', { level: 1, name: 'Frieren' }).closest('[data-testid="anime-detail-main-card"]');
    expect(mainCard).not.toBeNull();
    // The card is named after the anime, as the mockup's article is.
    expect(mainCard).toHaveAttribute('aria-labelledby', screen.getByRole('heading', { level: 1, name: 'Frieren' }).id);
    expect(mainCard?.contains(screen.getByRole('region', { name: 'Watch history' }))).toBe(false);
  });
});
