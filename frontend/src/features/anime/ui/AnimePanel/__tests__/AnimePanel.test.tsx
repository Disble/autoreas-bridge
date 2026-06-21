import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useAnimePanelMock = vi.fn();

vi.mock('../use-anime-panel', () => ({
  useAnimePanel: () => useAnimePanelMock(),
}));

import { AnimePanel } from '../AnimePanel';

describe('AnimePanel', () => {
  it('renders active and inactive animes with status badges', () => {
    useAnimePanelMock.mockReturnValue({
      isLoading: false,
      isEmpty: false,
      items: [
        {
          id: 'anime-active',
          nombre: 'Active Anime',
          estado: 2,
          progressLabel: '10 / 24',
          status: 'active',
          statusLabel: 'Active',
        },
        {
          id: 'anime-inactive',
          nombre: 'Inactive Anime',
          estado: 0,
          progressLabel: '0 / ?',
          status: 'inactive',
          statusLabel: 'Inactive',
        },
      ],
    });

    render(<AnimePanel />);

    expect(screen.getByText('Active Anime')).toBeInTheDocument();
    expect(screen.getByText('Inactive Anime')).toBeInTheDocument();
    expect(screen.getByText('10 / 24')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders the empty state when no animes are available', () => {
    useAnimePanelMock.mockReturnValue({
      isLoading: false,
      isEmpty: true,
      items: [],
    });

    render(<AnimePanel />);

    expect(screen.getByText('No animes found')).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    useAnimePanelMock.mockReturnValue({
      isLoading: true,
      isEmpty: false,
      items: [],
    });

    render(<AnimePanel />);

    expect(screen.getByText('Loading animes...')).toBeInTheDocument();
  });
});
