import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import { useCatalogPanel } from '../use-catalog-panel';

/** An active, fully configured record. */
const animeA: Anime = {
  id: 'anime-a',
  name: 'Alpha',
  status: 2,
  episodesWatched: 5,
  totalEpisodes: 12,
  active: 1,
  days: [],
  genres: [],
  hasDownloadPage: true,
  hasFolder: true,
};

/** An inactive record missing its download page. */
const animeB: Anime = {
  id: 'anime-b',
  name: 'Beta',
  status: 0,
  episodesWatched: 1,
  active: 0,
  days: [],
  genres: [],
  hasDownloadPage: false,
  hasFolder: true,
};

/** Builds a runtime source that resolves the given records, or rejects on demand. */
function createSource(items: Anime[], shouldReject = false): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: shouldReject
      ? vi.fn().mockRejectedValue(new Error('boom'))
      : vi.fn().mockResolvedValue(items),
    getAnimeDetail: vi.fn().mockResolvedValue(null),
    getAnimeHistory: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('useCatalogPanel', () => {
  it('returns loading initially', () => {
    const source = createSource([animeA]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.emptyState).toBe('none');
    expect(result.current.items).toEqual([]);
  });

  it('returns sorted view models after loading', async () => {
    const source = createSource([animeB, animeA]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].nombre).toBe('Alpha');
    expect(result.current.items[1].nombre).toBe('Beta');
    expect(result.current.items[0].status).toBe('active');
    expect(result.current.items[1].status).toBe('inactive');
  });

  it('restores every active and inactive record after an explicit active-only filter is cleared', async () => {
    const source = createSource([animeA, animeB]);
    const { result } = renderHook(() => useCatalogPanel({}, source));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.onActivoChange('1'));
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['anime-a']));

    act(() => result.current.onActivoChange('all'));
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(['anime-a', 'anime-b']));
  });

  it('returns the actual-empty state when the source returns an empty list', async () => {
    const source = createSource([]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.emptyState).toBe('actual'));

    expect(result.current.items).toEqual([]);
  });

  it('degrades a rejected source to an empty list without calling the catalog empty', async () => {
    const source = createSource([], true);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
    expect(result.current.emptyState).toBe('none');
  });

  it('exposes the canonical named tipo options regardless of catalog contents', async () => {
    const source = createSource([animeA, animeB]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.tipoOptions).toEqual([
      { value: 'all', label: 'All' },
      { value: '0', label: 'Anime (TV)' },
      { value: '1', label: 'Película' },
      { value: '2', label: 'Especial' },
      { value: '3', label: 'OVA' },
    ]);
  });

  it('exposes a gap filter and onGapChange callback defaulting to "all"', async () => {
    const source = createSource([animeA, animeB]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.filters.gap).toBe('all');
    expect(typeof result.current.onGapChange).toBe('function');
    expect(result.current.items).toHaveLength(2);
  });

  it('filters out complete animes when the gap filter is set to "missing"', async () => {
    const source = createSource([animeA, animeB]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.onGapChange('missing');

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].id).toBe('anime-b');
    expect(result.current.items[0].hasDownloadGap).toBe(true);
  });
});

describe('useCatalogPanel empty-state truth', () => {
  it('classifies nothing while the catalog request is unresolved', () => {
    const source = createSource([animeA]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    expect(result.current.emptyState).toBe('none');
  });

  it('classifies a resolved catalog with no anime as actually empty', async () => {
    const source = createSource([]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.emptyState).toBe('actual');
  });

  it('classifies a filtered-away catalog as criteria-empty rather than empty', async () => {
    const source = createSource([animeA]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.onTipoChange('Serie'));

    await waitFor(() => expect(result.current.emptyState).toBe('criteria'));
  });

  it('surfaces a rejected catalog request as an error rather than an empty catalog', async () => {
    const source = createSource([], true);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('boom');
    expect(result.current.emptyState).toBe('none');
  });

  it('restores every filter to the all-records default', async () => {
    const source = createSource([animeA, animeB]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.onQueryChange('alpha'));
    act(() => result.current.onEstadoChange('2'));
    act(() => result.current.onActivoChange('1'));
    act(() => result.current.onGenerosChange(['Action']));
    act(() => result.current.onClearCriteria());

    expect(result.current.filters).toEqual({
      query: '',
      estado: 'all',
      activo: 'all',
      tipo: 'all',
      dia: 'all',
      generos: [],
      gap: 'all',
    });
  });
});
