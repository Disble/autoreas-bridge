import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogPanelState } from '../catalog-panel.types';
import { createCatalogItem, createCatalogState } from './catalog-panel.test-support';

/** Stands in for the catalog hook so this suite asserts rendering only. */
const useCatalogPanelMock = vi.fn<() => CatalogPanelState>();

vi.mock('../use-catalog-panel', () => ({
  useCatalogPanel: () => useCatalogPanelMock(),
}));

import { CatalogPanel } from '../CatalogPanel';

/** Two resolved, unfiltered anime. */
const twoItems = [createCatalogItem(), createCatalogItem({ id: 'anime-2', name: 'Mushishi', listMeta: 'Anime (TV)' })];

/**
 * Renders the panel over the given view state.
 * @param overrides The view-state fields a case cares about.
 * @returns The view state the panel rendered.
 */
function renderPanel(overrides: Partial<CatalogPanelState> = {}): CatalogPanelState {
  const state = createCatalogState(overrides);
  useCatalogPanelMock.mockReturnValue(state);
  render(
    <MemoryRouter>
      <CatalogPanel />
    </MemoryRouter>,
  );
  return state;
}

/**
 * Finds the results list, once it exists.
 * @returns The list labelled "Anime catalog", or null.
 */
function queryResults(): HTMLElement | null {
  return screen.queryByRole('list', { name: 'Anime catalog' });
}

afterEach(cleanup);

describe('CatalogPanel header and chrome', () => {
  it('titles the catalog and creates an anime from the header', () => {
    const state = renderPanel({ items: twoItems, totalCount: 2, matchingCount: 2 });

    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.queryByText('Browse the synchronized anime inventory')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create an anime' }));
    expect(state.onCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('searchbox', { name: 'Search animes' })).toBeInTheDocument();
  });

  it('hides the header action, toolbar and result line when the catalog has no anime at all', () => {
    renderPanel({ hasCatalog: false, emptyState: 'actual' });

    expect(screen.getByText('Your catalog is empty')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Create an anime' })).toHaveLength(1);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });
});

describe('CatalogPanel results', () => {
  it.each([
    ['grid', 'OVA', 1],
    ['list', 'OVA · Drama', 0],
  ] as const)('renders the %s view as detail links with its meta line and the poster label', (view, meta, labelledPosters) => {
    renderPanel({ view, items: [twoItems[0]], totalCount: 1, matchingCount: 1 });

    const results = queryResults();
    expect(results).not.toBeNull();
    expect(within(results as HTMLElement).getByRole('link', { name: /Frieren/ })).toHaveAttribute('href', '/catalog/detail/anime-1');
    expect(screen.getByText(meta)).toBeInTheDocument();
    expect(screen.getByText('Viendo')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No cover' })).toBeInTheDocument();
    expect(screen.queryAllByText('No cover')).toHaveLength(labelledPosters);
  });

  it('draws a cover skeleton while the lookup is pending, then the art, reporting an art that fails to decode', () => {
    const getCover = vi.fn().mockReturnValueOnce({ status: 'loading' }).mockReturnValueOnce({ status: 'cover', src: 'data:image/png;base64,AA' });
    const state = renderPanel({ items: twoItems, totalCount: 2, matchingCount: 2, getCover });

    expect(screen.getAllByTestId('catalog-cover-loading')).toHaveLength(1);
    fireEvent.error(document.querySelector('img[src="data:image/png;base64,AA"]') as HTMLImageElement);
    expect(state.onCoverError).toHaveBeenCalledWith('anime-2');
  });

  it.each([
    [2, 2, 'Showing all 2', 'End of catalog'],
    [2, 5, 'Showing 2 of 5', 'End of catalog'],
    [30, 30, 'Showing all 30', 'Showing 2 of 30 — scroll for more'],
  ])('reports %i of %i matching anime in the result line, and the footer for two rendered',(matchingCount, totalCount, resultLine, footer) => {
    renderPanel({ items: twoItems, matchingCount, totalCount });

    expect(screen.getByText(/^Showing/, { selector: '[aria-live="polite"]' })).toHaveTextContent(resultLine);
    expect(screen.getByText(footer)).toBeInTheDocument();
  });
});

describe('CatalogPanel loading, empty and failure states', () => {
  it.each([
    ['grid', 'catalog-skeleton-card', 12],
    ['list', 'catalog-skeleton-row', 8],
  ] as const)('announces loading with %s skeletons and no real anime, even with stale rows', (view, testId, count) => {
    renderPanel({ view, isLoading: true, items: twoItems, totalCount: 2, matchingCount: 2 });

    const status = screen.getByRole('status', { name: 'Loading catalog' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading catalog')).toHaveClass('sr-only');
    expect(within(status).getAllByTestId(testId)).toHaveLength(count);
    expect(queryResults()).toBeNull();
    expect(screen.queryByText('Frieren')).toBeNull();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });

  it('offers creation, and never criteria recovery, when the catalog is actually empty', () => {
    const state = renderPanel({ hasCatalog: false, emptyState: 'actual' });

    fireEvent.click(screen.getByRole('button', { name: 'Create an anime' }));

    expect(state.onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Clear search and filters' })).toBeNull();
  });

  it('offers criteria recovery, and never creation, when the criteria hide every anime', () => {
    const state = renderPanel({ emptyState: 'criteria', totalCount: 3, hasCriteria: true });

    expect(screen.getByText('No anime match your criteria')).toBeInTheDocument();
    expect(document.querySelector('[data-airis-icon="filtered"]')).not.toBeNull();
    const clearButtons = screen.getAllByRole('button', { name: 'Clear search and filters' });
    expect(clearButtons).toHaveLength(2); // the result line's and the empty state's
    fireEvent.click(clearButtons[clearButtons.length - 1]);

    expect(state.onClearCriteria).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Your catalog is empty')).toBeNull();
  });

  it('reports a failed catalog request instead of any empty state or count', () => {
    renderPanel({ error: new Error('runtime unavailable') });

    expect(screen.getByText('Catalog unavailable')).toBeInTheDocument();
    expect(screen.getByText('runtime unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Your catalog is empty')).toBeNull();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });

  it.each([
    ['resolved with anime', { items: twoItems, totalCount: 2, matchingCount: 2 }],
    ['actually empty', { hasCatalog: false, emptyState: 'actual' }],
    ['criteria empty', { emptyState: 'criteria' }],
    ['failed', { error: new Error('runtime unavailable') }],
  ] as const)('renders no status region and no skeleton once the catalog is %s', (_label, overrides) => {
    renderPanel(overrides);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('catalog-skeleton-card')).toBeNull();
  });

  it.each([
    ['actually empty', { hasCatalog: false, emptyState: 'actual' }],
    ['criteria empty', { emptyState: 'criteria' }],
    ['failed', { error: new Error('runtime unavailable'), items: twoItems }],
  ] as const)('renders no results list while the catalog is %s', (_label, overrides) => {
    renderPanel(overrides);

    expect(queryResults()).toBeNull();
  });
});
