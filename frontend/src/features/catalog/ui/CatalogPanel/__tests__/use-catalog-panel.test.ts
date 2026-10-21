import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import { ANIME_CREATE_ROUTE } from '../../../../../shared/navigation/app-layout.constants';
import type { CatalogPanelState } from '../catalog-panel.types';
import { resetCatalogSession } from '../catalog-session.store';
import { useCatalogPanel } from '../use-catalog-panel';
import { createAnime } from './catalog-panel.test-support';

/** A finished TV anime carrying two genres. */
const alpha = createAnime({ id: 'anime-a', name: 'Alpha', status: 1, kind: 0, genres: ['Action', 'Drama'] });

/** A watched OVA carrying one of Alpha's genres. */
const beta = createAnime({ id: 'anime-b', name: 'Beta', status: 0, kind: 3, genres: ['Drama'] });

/**
 * Builds a runtime source that resolves the given records, or rejects.
 * @param items The records `getAnimes` resolves.
 * @param shouldReject Rejects `getAnimes` instead.
 * @returns A runtime source the hook reads through.
 */
function createSource(items: readonly Anime[], shouldReject = false): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: shouldReject ? vi.fn().mockRejectedValue(new Error('boom')) : vi.fn().mockResolvedValue(items),
    getAnimeDetail: vi.fn().mockResolvedValue(null),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

/**
 * Router the hook needs for `useNavigate`.
 * @param props The rendered hook host.
 * @returns The host inside a memory router opened on the Catalog.
 */
function RouterWrapper({ children }: { readonly children: ReactNode }) {
  return createElement(MemoryRouter, { initialEntries: ['/catalog'] }, children);
}

/**
 * Renders the hook beside the current location, so navigation is observable.
 * @param source The runtime source the hook reads.
 * @returns The rendered hook result.
 */
function renderCatalogPanel(source: BridgeRuntimeSource) {
  return renderHook(() => ({ panel: useCatalogPanel(source), pathname: useLocation().pathname }), { wrapper: RouterWrapper });
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
