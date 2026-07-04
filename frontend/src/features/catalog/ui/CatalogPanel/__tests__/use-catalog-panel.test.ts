import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import { useCatalogPanel } from '../use-catalog-panel';

const animeA: Anime = {
  id: 'anime-a',
  nombre: 'Alpha',
  estado: 2,
  nrocapvisto: 5,
  totalcap: 12,
  activo: 1,
  dias: [],
  generos: [],
  hasDownloadPage: true,
  hasFolder: true,
};

const animeB: Anime = {
  id: 'anime-b',
  nombre: 'Beta',
  estado: 0,
  nrocapvisto: 1,
  activo: 0,
  dias: [],
  generos: [],
  hasDownloadPage: false,
  hasFolder: true,
};

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
    pullAnimesFromLegacy: vi.fn().mockResolvedValue({
      message: 'ok',
      prunedCount: 0,
      status: 'ok',
      updatedCount: 0,
      warningCount: 0,
    }),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('useCatalogPanel', () => {
  it('returns loading initially', () => {
    const source = createSource([animeA]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isEmpty).toBe(false);
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

  it('returns empty when the source returns an empty list', async () => {
    const source = createSource([]);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isEmpty).toBe(true));

    expect(result.current.items).toEqual([]);
  });

  it('returns empty when the source rejects', async () => {
    const source = createSource([], true);
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isEmpty).toBe(true));

    expect(result.current.items).toEqual([]);
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

  it('pulls from legacy and refreshes animes after success', async () => {
    const source = createSource([animeA]);
    vi.mocked(source.getAnimes)
      .mockResolvedValueOnce([animeA])
      .mockResolvedValueOnce([animeA, animeB]);
    vi.mocked(source.pullAnimesFromLegacy).mockResolvedValueOnce({
      message: 'Pulled 1 update from legacy.',
      prunedCount: 0,
      status: 'ok',
      updatedCount: 1,
      warningCount: 0,
    });
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.onPullFromLegacy();

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(source.pullAnimesFromLegacy).toHaveBeenCalledTimes(1);
    expect(source.triggerReconcile).not.toHaveBeenCalled();
    expect(source.getAnimes).toHaveBeenCalledTimes(2);
    expect(result.current.pullResult?.status).toBe('ok');
  });

  it('exposes a safe error result when pull from legacy fails', async () => {
    const source = createSource([animeA]);
    vi.mocked(source.pullAnimesFromLegacy).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCatalogPanel({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.onPullFromLegacy();

    await waitFor(() => expect(result.current.pullResult?.status).toBe('error'));
    expect(result.current.pullResult?.message).toBe('Pull from legacy failed.');
  });
});
