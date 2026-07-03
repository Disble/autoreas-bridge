import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import { useAnimeDetail } from '../use-anime-detail';

const populatedDetail: AnimeDetail = {
  _id: 'anime-1',
  nombre: 'Frieren',
  estado: 2,
  nrocapvisto: 12,
  totalcap: 28,
  activo: 1,
  primeravez: 1,
  dias: [],
  generos: ['Fantasy'],
  modified_at: 0,
  repetir: [{ numrepeticion: 1, nrocapvisto: 24, estado: 1, fechaRepeticion: Date.UTC(2022, 0, 1) }],
};

function createSource(resolvedValue: AnimeDetail | null): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn(),
    getAnimeDetail: vi.fn().mockResolvedValue(resolvedValue),
    pullAnimesFromLegacy: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('useAnimeDetail', () => {
  it('returns loading while the fetch is in flight', () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    expect(result.current.loadState).toBe('loading');
    expect(result.current.detail).toBeUndefined();
  });

  it('returns loaded with a populated repetition timeline', async () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.detail?.hasRepetitionHistory).toBe(true);
    expect(result.current.detail?.repetitions).toHaveLength(1);
    expect(source.getAnimeDetail).toHaveBeenCalledWith('anime-1');
  });

  it('returns not-found when the id does not resolve to a record', async () => {
    const source = createSource(null);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'missing-id' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('not-found'));

    expect(result.current.detail).toBeUndefined();
  });

  it('degrades to not-found when the runtime/binding is unavailable', async () => {
    // bridgeRuntimeSource.getAnimeDetail resolves null (never rejects) when the
    // Wails runtime or the GetAnimeDetail binding is unavailable, so this is
    // the same code path as the not-found case above.
    const source = createSource(null);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('not-found'));
  });

  it('re-fetches when the animeId prop changes', async () => {
    const source = createSource(populatedDetail);
    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeDetail({ animeId }, source),
      { initialProps: { animeId: 'anime-1' } },
    );

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    rerender({ animeId: 'anime-2' });

    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenLastCalledWith('anime-2'));
  });
});
