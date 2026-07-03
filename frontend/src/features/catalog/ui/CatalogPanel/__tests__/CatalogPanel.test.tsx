import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ANIME_FILTER_ALL_VALUE } from '../catalog-panel.constants';

const useCatalogPanelMock = vi.fn();

vi.mock('../use-catalog-panel', () => ({
  useCatalogPanel: () => useCatalogPanelMock(),
}));

import { CatalogPanel } from '../CatalogPanel';

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
    onPullFromLegacy: vi.fn(),
    isPullingFromLegacy: false,
    pullResult: undefined,
    ...overrides,
  };
}

describe('CatalogPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders active and inactive animes with status badges', () => {
    useCatalogPanelMock.mockReturnValue(
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

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('Active Anime')).toBeInTheDocument();
    expect(screen.getByText('Inactive Anime')).toBeInTheDocument();
    expect(screen.getByText('10 / 24')).toBeInTheDocument();
    expect(screen.getByTestId('anime-status-anime-active')).toHaveTextContent('Active');
    expect(screen.getByTestId('anime-status-anime-inactive')).toHaveTextContent('Inactive');
  });

  it('renders the empty state when no animes are available', () => {
    useCatalogPanelMock.mockReturnValue(createHookReturn({ isEmpty: true, items: [] }));

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('No animes found')).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    useCatalogPanelMock.mockReturnValue(createHookReturn({ isLoading: true, isEmpty: false, items: [] }));

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading animes...')).toBeInTheDocument();
  });

  it('renders a gap badge for animes missing a download page or folder', () => {
    useCatalogPanelMock.mockReturnValue(
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

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('anime-gap-anime-gap')).toHaveTextContent('Missing page');
  });

  it('does not render a gap badge for animes with both page and folder', () => {
    useCatalogPanelMock.mockReturnValue(
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

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('anime-gap-anime-complete')).not.toBeInTheDocument();
  });

  it('renders a Pull from legacy action wired to the hook callback', () => {
    const onPullFromLegacy = vi.fn();
    useCatalogPanelMock.mockReturnValue(createHookReturn({ onPullFromLegacy }));

    const view = render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    const button = within(view.container).getByRole('button', { name: 'Pull from legacy' });
    fireEvent.click(button);

    expect(onPullFromLegacy).toHaveBeenCalledTimes(1);
  });

  it('shows pull progress and result feedback', () => {
    useCatalogPanelMock.mockReturnValue(
      createHookReturn({
        isPullingFromLegacy: true,
        pullResult: {
          message: 'Pulled 2 updates from legacy.',
          prunedCount: 0,
          status: 'ok',
          updatedCount: 2,
          warningCount: 0,
        },
      }),
    );

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Pulling from legacy...' })).toBeDisabled();
    expect(screen.getByText('Pulled 2 updates from legacy.')).toBeInTheDocument();
  });

  it('links each anime row to its shared detail route', () => {
    useCatalogPanelMock.mockReturnValue(
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
        ],
      }),
    );

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Active Anime/ })).toHaveAttribute(
      'href',
      '/catalog/detail/anime-active',
    );
  });
});
