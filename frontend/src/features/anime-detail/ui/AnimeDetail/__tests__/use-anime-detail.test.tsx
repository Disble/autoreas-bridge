import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import { useAnimeDetail } from '../use-anime-detail';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

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
    getAnimeHistory: vi.fn(),
    pullAnimesFromLegacy: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('useAnimeDetail', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    window.history.replaceState(null, '');
  });

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

  it('shows the portada placeholder when the detail has no portada', async () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.showPortadaPlaceholder).toBe(true);
  });

  it('hides the portada placeholder when the detail has a portada, until onPortadaError fires', async () => {
    const source = createSource({ ...populatedDetail, portada: 'C:/legacy/portadas/frieren.jpg' });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.showPortadaPlaceholder).toBe(false);

    act(() => {
      result.current.onPortadaError();
    });

    expect(result.current.showPortadaPlaceholder).toBe(true);
  });

  it('resets the portada-error flag when the animeId prop changes', async () => {
    const source = createSource({ ...populatedDetail, portada: 'C:/legacy/portadas/frieren.jpg' });
    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeDetail({ animeId }, source),
      { initialProps: { animeId: 'anime-1' } },
    );

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      result.current.onPortadaError();
    });
    expect(result.current.showPortadaPlaceholder).toBe(true);

    rerender({ animeId: 'anime-2' });

    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenLastCalledWith('anime-2'));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.showPortadaPlaceholder).toBe(false);
  });

  it('shows the portada placeholder when onPortadaLoad fires with a zero natural width', async () => {
    const source = createSource({ ...populatedDetail, portada: 'C:/legacy/portadas/frieren.jpg' });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.showPortadaPlaceholder).toBe(false);

    act(() => {
      result.current.onPortadaLoad({ currentTarget: { naturalWidth: 0 } } as never);
    });

    expect(result.current.showPortadaPlaceholder).toBe(true);
  });

  it('keeps the cover image when onPortadaLoad fires with a nonzero natural width', async () => {
    const source = createSource({ ...populatedDetail, portada: 'C:/legacy/portadas/frieren.jpg' });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      result.current.onPortadaLoad({ currentTarget: { naturalWidth: 96 } } as never);
    });

    expect(result.current.showPortadaPlaceholder).toBe(false);
  });

  it('calls navigate("/history") when there is no previous history entry', async () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      result.current.onBack();
    });

    expect(navigateMock).toHaveBeenCalledWith('/history');
  });

  it('calls navigate(-1) when a previous history entry exists', async () => {
    window.history.replaceState({ idx: 1 }, '');
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      result.current.onBack();
    });

    expect(navigateMock).toHaveBeenCalledWith(-1);
  });
});
