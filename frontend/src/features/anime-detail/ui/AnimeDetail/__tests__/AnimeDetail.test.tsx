import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useAnimeDetailMock = vi.fn();

vi.mock('../use-anime-detail', () => ({
  useAnimeDetail: () => useAnimeDetailMock(),
}));

import { AnimeDetail } from '../AnimeDetail';

function createDetailViewModel(overrides = {}) {
  return {
    id: 'anime-1',
    nombre: 'Frieren',
    portadaUrl: undefined,
    estadoLabel: 'Abandonado',
    tipoLabel: 'Serie',
    subtitleLabel: 'Abandonado • Serie',
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
    repetitions: [],
    hasRepetitionHistory: false,
    ...overrides,
  };
}

function mockAnimeDetailState(overrides = {}) {
  useAnimeDetailMock.mockReturnValue({
    loadState: 'loaded',
    detail: createDetailViewModel(),
    showPortadaPlaceholder: true,
    onPortadaError: vi.fn(),
    ...overrides,
  });
}

describe('AnimeDetail', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading message while loadState is loading', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'loading',
      detail: undefined,
      showPortadaPlaceholder: true,
      onPortadaError: vi.fn(),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('Loading anime detail...')).toBeInTheDocument();
  });

  it('renders a not-found message when loadState is not-found', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'not-found',
      detail: undefined,
      showPortadaPlaceholder: true,
      onPortadaError: vi.fn(),
    });

    render(<AnimeDetail animeId="missing-id" />);

    expect(screen.getByText('Anime not found.')).toBeInTheDocument();
  });

  it('renders the hero header with título, subtitle, and status chip', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByRole('heading', { name: 'Frieren' })).toBeInTheDocument();
    expect(screen.getByText('Abandonado • Serie')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders a placeholder instead of a broken image when portada is missing', () => {
    mockAnimeDetailState({ showPortadaPlaceholder: true });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.queryByRole('img', { name: 'Cover art' })).not.toBeInTheDocument();
    expect(screen.getByTestId('anime-detail-portada-placeholder')).toBeInTheDocument();
  });

  it('renders the cover image and wires onError to the hook callback when portada is present', () => {
    const onPortadaError = vi.fn();
    mockAnimeDetailState({
      detail: createDetailViewModel({ portadaUrl: 'C:/legacy/portadas/frieren.jpg' }),
      showPortadaPlaceholder: false,
      onPortadaError,
    });

    render(<AnimeDetail animeId="anime-1" />);

    const image = screen.getByRole('img', { name: 'Cover art' });
    expect(image).toHaveAttribute('src', 'C:/legacy/portadas/frieren.jpg');

    fireEvent.error(image);

    expect(onPortadaError).toHaveBeenCalledTimes(1);
  });

  it('renders the per-chapter stat tiles with explicit fallbacks', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({
        statTiles: [
          { label: 'Watched', value: '12' },
          { label: 'Total episodes', value: 'No total episodes data' },
          { label: 'Duration', value: 'No episode duration data' },
        ],
        progressRatio: undefined,
      }),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('No total episodes data')).toBeInTheDocument();
    expect(screen.getByText('No episode duration data')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders the progress bar only when the progress ratio is known', () => {
    mockAnimeDetailState({ detail: createDetailViewModel({ progressRatio: 43 }) });

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

  it('renders the repetition timeline when populated', () => {
    mockAnimeDetailState({
      detail: createDetailViewModel({
        hasRepetitionHistory: true,
        repetitions: [
          { key: '1-0', numRepeticion: 1, progressLabel: '24 / ?', repeatedOnLabel: '2022-01-01' },
        ],
      }),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('Repetition 1')).toBeInTheDocument();
    expect(screen.queryByText('No repetition history.')).not.toBeInTheDocument();
  });

  it('renders the no-repetitions fallback when the timeline is empty', () => {
    mockAnimeDetailState();

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('No repetition history.')).toBeInTheDocument();
  });
});
