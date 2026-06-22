import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ANIME_FILTER_ALL_VALUE } from '../anime-panel.constants';

const useAnimePanelMock = vi.fn();

vi.mock('../use-anime-panel', () => ({
  useAnimePanel: () => useAnimePanelMock(),
}));

import { AnimePanel } from '../AnimePanel';

function createHookReturn(overrides = {}) {
  return {
    isLoading: false,
    isEmpty: false,
    items: [],
    filters: {
      query: '',
      estado: ANIME_FILTER_ALL_VALUE,
      activo: ANIME_FILTER_ALL_VALUE,
      tipo: ANIME_FILTER_ALL_VALUE,
      dia: ANIME_FILTER_ALL_VALUE,
      generos: [],
      gap: ANIME_FILTER_ALL_VALUE,
    },
    estadoOptions: [],
    activoOptions: [],
    tipoOptions: [],
    diaOptions: [],
    generoOptions: [],
    gapOptions: [],
    onQueryChange: vi.fn(),
    onEstadoChange: vi.fn(),
    onActivoChange: vi.fn(),
    onTipoChange: vi.fn(),
    onDiaChange: vi.fn(),
    onGenerosChange: vi.fn(),
    onGapChange: vi.fn(),
    ...overrides,
  };
}

describe('AnimePanel', () => {
  it('renders active and inactive animes with status badges', () => {
    useAnimePanelMock.mockReturnValue(
      createHookReturn({
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
      }),
    );

    render(<AnimePanel />);

    expect(screen.getByText('Active Anime')).toBeInTheDocument();
    expect(screen.getByText('Inactive Anime')).toBeInTheDocument();
    expect(screen.getByText('10 / 24')).toBeInTheDocument();
    expect(screen.getByTestId('anime-status-anime-active')).toHaveTextContent('Active');
    expect(screen.getByTestId('anime-status-anime-inactive')).toHaveTextContent('Inactive');
  });

  it('renders the empty state when no animes are available', () => {
    useAnimePanelMock.mockReturnValue(createHookReturn({ isEmpty: true, items: [] }));

    render(<AnimePanel />);

    expect(screen.getByText('No animes found')).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    useAnimePanelMock.mockReturnValue(createHookReturn({ isLoading: true, isEmpty: false, items: [] }));

    render(<AnimePanel />);

    expect(screen.getByText('Loading animes...')).toBeInTheDocument();
  });

  it('renders a gap badge for animes missing a download page or folder', () => {
    useAnimePanelMock.mockReturnValue(
      createHookReturn({
        isEmpty: false,
        items: [
          {
            id: 'anime-gap',
            nombre: 'Gap Anime',
            estado: 2,
            progressLabel: '1 / 12',
            status: 'active',
            statusLabel: 'Active',
            hasDownloadPage: false,
            hasFolder: true,
            hasDownloadGap: true,
            gapLabel: 'Missing page',
          },
        ],
      }),
    );

    render(<AnimePanel />);

    expect(screen.getByTestId('anime-gap-anime-gap')).toHaveTextContent('Missing page');
  });

  it('does not render a gap badge for animes with both page and folder', () => {
    useAnimePanelMock.mockReturnValue(
      createHookReturn({
        isEmpty: false,
        items: [
          {
            id: 'anime-complete',
            nombre: 'Complete Anime',
            estado: 2,
            progressLabel: '1 / 12',
            status: 'active',
            statusLabel: 'Active',
            hasDownloadPage: true,
            hasFolder: true,
            hasDownloadGap: false,
            gapLabel: undefined,
          },
        ],
      }),
    );

    render(<AnimePanel />);

    expect(screen.queryByTestId('anime-gap-anime-complete')).not.toBeInTheDocument();
  });
});
