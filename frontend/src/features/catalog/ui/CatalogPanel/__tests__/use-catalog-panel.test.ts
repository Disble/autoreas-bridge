import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeSource } from '../../../../../shared/contracts/anime-source.types';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { ANIME_CREATE_ROUTE } from '../../../../../shared/navigation/app-layout.constants';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import type { CatalogPanelState } from '../catalog-panel.types';
import { resetCatalogSession } from '../catalog-session.store';
import { useCatalogPanel } from '../use-catalog-panel';
import { createAnime } from './catalog-panel.test-support';

/** A finished TV anime carrying two genres. */
const alpha = createAnime({ id: 'anime-a', name: 'Alpha', status: 1, kind: 0, genres: ['Action', 'Drama'] });

/** A watched OVA carrying one of Alpha's genres. */
const beta = createAnime({ id: 'anime-b', name: 'Beta', status: 0, kind: 3, genres: ['Drama'] });

/**
 * Builds an anime source that resolves the given records, or rejects.
 * @param items The records `getAnimes` resolves.
 * @param shouldReject Rejects `getAnimes` instead.
 * @returns An anime source the hook reads through.
 */
function createSource(items: readonly Anime[], shouldReject = false): AnimeSource {
  return {
    getAnimes: shouldReject ? vi.fn().mockRejectedValue(createBridgeError('internal', 'boom')) : vi.fn().mockResolvedValue(items),
    getAnimeDetail: vi.fn(),
    getWatchHistoryPage: vi.fn(),
    getAnimeWatchHistoryPage: vi.fn(),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
  };
}

/**
 * Renders the hook beside the current location, so navigation is observable,
 * inside a memory router and a query wrapper reporting the `anime` module.
 * @param source The anime source the hook reads.
 * @param anime The `anime` module's readiness.
 * @returns The rendered hook result and `emit`, which pushes a readiness change.
 */
function renderCatalogPanel(source: AnimeSource, anime: ModuleReadiness = { module: 'anime', state: 'ready' }) {
  const modules = createModulesTestWrapper(anime);
  /** Router the hook needs for `useNavigate`, around the query wrapper. */
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries: ['/catalog'] }, createElement(modules.wrapper, null, children));
  }
  const rendered = renderHook(() => ({ panel: useCatalogPanel(source), pathname: useLocation().pathname }), { wrapper: Wrapper });
  return { ...rendered, emit: modules.emit };
}

/**
 * Renders the hook and waits for the catalog request to settle.
 * @param items The records the source resolves.
 * @returns The rendered hook result.
 */
async function renderResolved(items: readonly Anime[]) {
  const rendered = renderCatalogPanel(createSource(items));
  await waitFor(() => expect(rendered.result.current.panel.isLoading).toBe(false));
  return rendered;
}

/**
 * Lists the ids of the rendered items.
 * @param panel The hook state.
 * @returns The item ids, in render order.
 */
function itemIds(panel: CatalogPanelState): readonly string[] {
  return panel.items.map((item) => item.id);
}

beforeEach(() => {
  resetCatalogSession();
});

describe('useCatalogPanel', () => {
  it('classifies nothing and keeps the catalog shown while the request is unresolved', () => {
    const { result } = renderCatalogPanel(createSource([alpha]));

    expect(result.current.panel).toMatchObject({ isLoading: true, emptyState: 'none', hasCatalog: true, items: [], totalCount: 0 });
  });

  it('returns name-sorted view models with the genres discovered from the catalog', async () => {
    const { result } = await renderResolved([beta, alpha]);

    expect(result.current.panel.items).toEqual([
      { id: 'anime-a', name: 'Alpha', hasCover: false, statusLabel: 'Finalizado', statusColor: 'success', kindLabel: 'Anime (TV)', listMeta: 'Anime (TV) · Action, Drama' },
      { id: 'anime-b', name: 'Beta', hasCover: false, statusLabel: 'Viendo', statusColor: 'accent', kindLabel: 'OVA', listMeta: 'OVA · Drama' },
    ]);
    expect(result.current.panel.genreOptions.map((option) => option.value)).toEqual(['Action', 'Drama']);
    expect(result.current.panel).toMatchObject({ totalCount: 2, matchingCount: 2, activeFilterCount: 0, hasCriteria: false });
  });

  it('applies the sort the user picked', async () => {
    const { result } = await renderResolved([alpha, beta]);

    act(() => result.current.panel.onSortChange('name-desc'));

    expect(itemIds(result.current.panel)).toEqual(['anime-b', 'anime-a']);
  });

  it.each([
    ['status', (panel: CatalogPanelState) => panel.onStatusSelectionChange(new Set(['0'])), ['anime-b'], ['Status: Viendo']],
    ['type', (panel: CatalogPanelState) => panel.onKindSelectionChange(new Set(['0'])), ['anime-a'], ['Type: Anime (TV)']],
    ['every genre', (panel: CatalogPanelState) => panel.onGenresSelectionChange(new Set(['Drama', 'Action'])), ['anime-a'], ['Genre: Drama', 'Genre: Action']],
    ['a shared genre', (panel: CatalogPanelState) => panel.onGenresSelectionChange(new Set(['Drama'])), ['anime-a', 'anime-b'], ['Genre: Drama']],
  ])('narrows by %s and names each active filter in a chip', async (_label, select, expectedIds, expectedChips) => {
    const { result } = await renderResolved([alpha, beta]);

    act(() => select(result.current.panel));

    const { panel } = result.current;
    expect(itemIds(panel)).toEqual(expectedIds);
    expect(panel.criterionChips.map((chip) => `${chip.groupLabel}: ${chip.valueLabel}`)).toEqual(expectedChips);
    expect(panel).toMatchObject({ matchingCount: expectedIds.length, totalCount: 2, activeFilterCount: expectedChips.length, hasCriteria: true });
  });

  it('applies the search only after the debounce, while reporting it as a criterion at once', async () => {
    const { result } = await renderResolved([alpha, beta]);

    act(() => result.current.panel.onQueryChange('alp'));

    expect(result.current.panel).toMatchObject({ hasCriteria: true, activeFilterCount: 0, matchingCount: 2 });
    await waitFor(() => expect(itemIds(result.current.panel)).toEqual(['anime-a']));
  });

  it('classifies a resolved catalog with no anime as actually empty and hides the catalog chrome', async () => {
    const { result } = await renderResolved([]);

    expect(result.current.panel).toMatchObject({ emptyState: 'actual', hasCatalog: false, totalCount: 0 });
  });

  it('classifies a filtered-away catalog as criteria-empty, keeping the catalog chrome', async () => {
    const { result } = await renderResolved([alpha]);

    act(() => result.current.panel.onKindSelectionChange(new Set(['3'])));

    expect(result.current.panel).toMatchObject({ emptyState: 'criteria', hasCatalog: true, matchingCount: 0, totalCount: 1 });
  });

  it('stays loading without reading the catalog while the anime module starts, then shows it once ready', async () => {
    const source = createSource([alpha]);
    const { result, emit } = renderCatalogPanel(source, { module: 'anime', state: 'starting' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.panel).toMatchObject({ isLoading: true, emptyState: 'none', items: [], error: undefined });
    expect(source.getAnimes).not.toHaveBeenCalled();

    act(() => emit({ module: 'anime', state: 'ready' }));
    await waitFor(() => expect(itemIds(result.current.panel)).toEqual(['anime-a']));
  });

  it('shows the failure reason, never an empty catalog, when the anime module failed', async () => {
    const source = createSource([alpha]);
    const { result } = renderCatalogPanel(source, { module: 'anime', state: 'failed', reason: 'anime: bridge database failed to open' });

    await waitFor(() => expect(result.current.panel.error?.message).toBe('anime: bridge database failed to open'));
    expect(result.current.panel).toMatchObject({ isLoading: false, emptyState: 'none', hasCatalog: true, items: [] });
    expect(source.getAnimes).not.toHaveBeenCalled();
  });

  it('surfaces a rejected catalog request as an error rather than an empty catalog', async () => {
    const { result } = renderCatalogPanel(createSource([], true));

    await waitFor(() => expect(result.current.panel.error?.message).toBe('boom'));
    expect(result.current.panel).toMatchObject({ emptyState: 'none', hasCatalog: true });
  });

  it('opens the Create anime screen', async () => {
    const { result } = await renderResolved([alpha]);

    act(() => result.current.panel.onCreate());

    expect(result.current.pathname).toBe(ANIME_CREATE_ROUTE);
  });
});
