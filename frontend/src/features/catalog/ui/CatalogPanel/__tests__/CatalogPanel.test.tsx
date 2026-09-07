import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ANIME_FILTER_ALL_VALUE } from '../catalog-panel.constants';

/** Stands in for the catalog hook so this suite asserts rendering only. */
const useCatalogPanelMock = vi.fn();

vi.mock('../use-catalog-panel', () => ({
  useCatalogPanel: () => useCatalogPanelMock(),
}));

import { CatalogPanel } from '../CatalogPanel';

/** Builds a complete catalog view state so each case overrides only what it exercises. */
function createHookReturn(overrides = {}) {
  return {
    isLoading: false,
    emptyState: 'none',
    error: undefined,
    items: [],
    listWindow: { scrollRef: { current: null }, onScroll: vi.fn(), visibleCount: 20 },
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
    onClearCriteria: vi.fn(),
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
        emptyState: 'none',
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

  it('offers creation, and never criteria recovery, when the catalog resolved with no anime', () => {
    useCatalogPanelMock.mockReturnValue(createHookReturn({ emptyState: 'actual', items: [] }));

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('Your catalog is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create an anime' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search and filters' })).toBeNull();
  });

  it('offers criteria recovery, and never creation, when filters hide every anime', () => {
    const onClearCriteria = vi.fn();
    useCatalogPanelMock.mockReturnValue(createHookReturn({ emptyState: 'criteria', items: [], onClearCriteria }));

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('No anime match your criteria')).toBeInTheDocument();
    expect(screen.queryByText('Your catalog is empty')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create an anime' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));

    expect(onClearCriteria).toHaveBeenCalledTimes(1);
  });

  it('reports a failed catalog request instead of any empty state', () => {
    useCatalogPanelMock.mockReturnValue(createHookReturn({ error: new Error('runtime unavailable'), items: [] }));

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('Catalog unavailable')).toBeInTheDocument();
    expect(screen.getByText('runtime unavailable')).toBeInTheDocument();
    expect(document.querySelector('img[aria-hidden="true"]')).toBeNull();
  });

  it('renders the loading state', () => {
    useCatalogPanelMock.mockReturnValue(createHookReturn({ isLoading: true, items: [] }));

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
        emptyState: 'none',
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
        emptyState: 'none',
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

  it('links each anime row to its shared detail route', () => {
    useCatalogPanelMock.mockReturnValue(
      createHookReturn({
        emptyState: 'none',
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

describe('CatalogPanel list visibility', () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    ['loading', { isLoading: true }],
    ['actually empty', { emptyState: 'actual' }],
    ['criteria empty', { emptyState: 'criteria' }],
    ['failed', { error: new Error('runtime unavailable') }],
  ])('renders no catalog list while the catalog is %s', (_label, override) => {
    useCatalogPanelMock.mockReturnValue(createHookReturn({ items: [], ...override }));

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('catalog-list-scroll')).toBeNull();
  });

  it('renders the catalog list once the request resolved with visible rows', () => {
    useCatalogPanelMock.mockReturnValue(
      createHookReturn({
        items: [{ id: 'anime-active', nombre: 'Active Anime', estado: 2, progressLabel: '10 / 24', status: 'active', statusLabel: 'Active' }],
      }),
    );

    render(
      <MemoryRouter>
        <CatalogPanel />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('catalog-list-scroll')).toBeInTheDocument();
  });

  it('navigates to the Create workspace from the actually-empty catalog', () => {
    useCatalogPanelMock.mockReturnValue(createHookReturn({ emptyState: 'actual', items: [] }));

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <Routes>
          <Route element={<CatalogPanel />} path="/catalog" />
          <Route element={<h2>Create workspace</h2>} path="/editor/create" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create an anime' }));

    expect(screen.getByRole('heading', { name: 'Create workspace' })).toBeInTheDocument();
  });
});
