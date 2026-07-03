import { cleanup, render, screen } from '@testing-library/react';
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
    progressLabel: '12 / 28',
    genres: ['Fantasy'],
    studios: 'Madhouse',
    origin: 'Manga',
    isFirstWatch: true,
    repetitions: [],
    hasRepetitionHistory: false,
    ...overrides,
  };
}

describe('AnimeDetail', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading message while loadState is loading', () => {
    useAnimeDetailMock.mockReturnValue({ loadState: 'loading', detail: undefined });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('Loading anime detail...')).toBeInTheDocument();
  });

  it('renders a not-found message when loadState is not-found', () => {
    useAnimeDetailMock.mockReturnValue({ loadState: 'not-found', detail: undefined });

    render(<AnimeDetail animeId="missing-id" />);

    expect(screen.getByText('Anime not found.')).toBeInTheDocument();
  });

  it('renders the detail data when loaded', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'loaded',
      detail: createDetailViewModel(),
    });

    render(<AnimeDetail animeId="anime-1" />);

    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('12 / 28')).toBeInTheDocument();
    expect(screen.getByText('Madhouse')).toBeInTheDocument();
    expect(screen.getByText('Manga')).toBeInTheDocument();
    expect(screen.getByText('No repetition history.')).toBeInTheDocument();
  });

  it('renders the repetition timeline when populated', () => {
    useAnimeDetailMock.mockReturnValue({
      loadState: 'loaded',
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
});
