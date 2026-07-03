import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { Anime, AnimeDetail } from '../../../../../shared/contracts/anime.types';
import { useHistoryList } from '../use-history-list';

function anime(overrides: Partial<Anime>): Anime {
  return {
    id: 'anime-1',
    nombre: 'Frieren',
    estado: 2,
    nrocapvisto: 0,
    totalcap: 28,
    activo: 1,
    dias: [],
    generos: [],
    hasDownloadPage: true,
    hasFolder: true,
    ...overrides,
  };
}

function detail(overrides: Partial<AnimeDetail>): AnimeDetail {
  return {
    _id: 'anime-1',
    nombre: 'Frieren',
    estado: 2,
    nrocapvisto: 0,
    totalcap: 28,
    activo: 1,
    primeravez: 0,
    dias: [],
    generos: [],
    modified_at: 0,
    ...overrides,
  };
}

function createSource(items: readonly Anime[], detailsById: ReadonlyMap<string, AnimeDetail>): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn().mockResolvedValue(items),
    getAnimeDetail: vi.fn((id: string) => Promise.resolve(detailsById.get(id) ?? null)),
    pullAnimesFromLegacy: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('useHistoryList', () => {
  it('returns loading with no items while the fetch is in flight', () => {
    const source = createSource([], new Map());
    const { result } = renderHook(() => useHistoryList({}, source));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it('excludes an anime with zero progress and no repetition history, without fetching its detail', async () => {
    const items = [anime({ id: 'no-progress', nrocapvisto: 0, totalcap: 28 })];
    const source = createSource(items, new Map());
    const { result } = renderHook(() => useHistoryList({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(source.getAnimeDetail).not.toHaveBeenCalled();
  });

  it('includes an in-progress anime and enriches it with its repetition timeline', async () => {
    const items = [anime({ id: 'in-progress', nombre: 'Frieren', nrocapvisto: 12, totalcap: 28 })];
    const details = new Map([
      [
        'in-progress',
        detail({
          _id: 'in-progress',
          nrocapvisto: 12,
          totalcap: 28,
          repetir: [{ numrepeticion: 1, nrocapvisto: 28, estado: 1, fechaRepeticion: Date.UTC(2023, 0, 1) }],
        }),
      ],
    ]);
    const source = createSource(items, details);
    const { result } = renderHook(() => useHistoryList({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.progressLabel).toBe('12 / 28');
    expect(result.current.items[0]?.repetitionCount).toBe(1);
    expect(source.getAnimeDetail).toHaveBeenCalledWith('in-progress');
  });

  it('excludes a complete anime (detail confirms no repetition history)', async () => {
    const items = [anime({ id: 'complete', nrocapvisto: 28, totalcap: 28 })];
    const details = new Map([['complete', detail({ _id: 'complete', nrocapvisto: 28, totalcap: 28, repetir: [] })]]);
    const source = createSource(items, details);
    const { result } = renderHook(() => useHistoryList({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
    expect(source.getAnimeDetail).toHaveBeenCalledWith('complete');
  });

  it('includes a complete anime that has repetition history', async () => {
    const items = [anime({ id: 'rewatched', nrocapvisto: 28, totalcap: 28 })];
    const details = new Map([
      [
        'rewatched',
        detail({
          _id: 'rewatched',
          nrocapvisto: 28,
          totalcap: 28,
          repetir: [{ numrepeticion: 1, nrocapvisto: 28, estado: 1 }],
        }),
      ],
    ]);
    const source = createSource(items, details);
    const { result } = renderHook(() => useHistoryList({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.id).toBe('rewatched');
  });

  it('sorts qualifying entries alphabetically by name', async () => {
    const items = [
      anime({ id: 'z', nombre: 'Zenshuu', nrocapvisto: 3, totalcap: 12 }),
      anime({ id: 'b', nombre: 'Bocchi the Rock', nrocapvisto: 3, totalcap: 12 }),
    ];
    const details = new Map([
      ['z', detail({ _id: 'z', nrocapvisto: 3, totalcap: 12 })],
      ['b', detail({ _id: 'b', nrocapvisto: 3, totalcap: 12 })],
    ]);
    const source = createSource(items, details);
    const { result } = renderHook(() => useHistoryList({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.map((item) => item.id)).toEqual(['b', 'z']);
  });

  it('degrades to an empty, non-loading state when the fetch rejects', async () => {
    const source = {
      ...createSource([], new Map()),
      getAnimes: vi.fn().mockRejectedValue(new Error('runtime unavailable')),
    };
    const { result } = renderHook(() => useHistoryList({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
  });

  it('exposes no mutation callable -- read-only state only', async () => {
    const source = createSource([], new Map());
    const { result } = renderHook(() => useHistoryList({}, source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(Object.keys(result.current).sort()).toEqual(['isEmpty', 'isLoading', 'items']);
    for (const value of Object.values(result.current)) {
      expect(typeof value).not.toBe('function');
    }
  });
});
