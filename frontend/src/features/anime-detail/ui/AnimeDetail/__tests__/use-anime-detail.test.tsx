import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ReactRouter from 'react-router';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import { useAnimeDetail } from '../use-anime-detail';

// Spy instead of vi.mock: with deps.optimizer enabled, importOriginal-based
// partial mocks cannot re-import the original module.
const navigateMock = vi.fn();

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

function createSource(
  resolvedValue: AnimeDetail | null,
  overrides: Partial<BridgeRuntimeSource> = {},
): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeDetail: vi.fn().mockResolvedValue(resolvedValue),
    getAnimeHistory: vi.fn(),
    pullAnimesFromLegacy: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    restoreAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    repeatAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    ...overrides,
  };
}

describe('useAnimeDetail', () => {
  beforeEach(() => {
    vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(navigateMock);
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

  it('deep-links Edit anime to /editor/:id', async () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      result.current.onEditAnime();
    });

    expect(navigateMock).toHaveBeenCalledWith('/editor/anime-1');
  });

  it('cancels an explicit confirmation without invoking either binding', async () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    expect(result.current.confirmation?.action).toBe('repeat');
    act(() => result.current.onCancelAction());

    expect(result.current.confirmation).toBeUndefined();
    expect(source.restoreAnime).not.toHaveBeenCalled();
    expect(source.repeatAnime).not.toHaveBeenCalled();
  });

  it('sends the exact zero detail token for Repeat and refetches AnimeDetail only after applied', async () => {
    const refreshed = { ...populatedDetail, estado: 0, modified_at: 11 };
    const getAnimeDetail = vi.fn()
      .mockResolvedValueOnce(populatedDetail)
      .mockResolvedValueOnce(refreshed);
    const repeatAnime = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 11 });
    const source = createSource(populatedDetail, { getAnimeDetail, repeatAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(repeatAnime).toHaveBeenCalledWith('anime-1', 0);
    expect(getAnimeDetail).toHaveBeenCalledTimes(2);
    expect(source.getAnimes).not.toHaveBeenCalled();
    expect(result.current.feedback).toEqual({
      status: 'success',
      title: 'Repeat applied',
      description: 'Repeat was applied. Current version: 11.',
    });
    expect(result.current.detail?.modifiedAt).toBe(11);
  });

  it('reports a Restore no-op accurately and refetches AnimeDetail only', async () => {
    const inactive = { ...populatedDetail, activo: 0, modified_at: 41 };
    const refreshed = { ...inactive, activo: 1 };
    const getAnimeDetail = vi.fn().mockResolvedValueOnce(inactive).mockResolvedValueOnce(refreshed);
    const restoreAnime = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'no_op', modifiedAt: 41 });
    const source = createSource(inactive, { getAnimeDetail, restoreAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRestore());
    await act(async () => result.current.onConfirmAction());

    expect(restoreAnime).toHaveBeenCalledWith('anime-1', 41);
    expect(getAnimeDetail).toHaveBeenCalledTimes(2);
    expect(source.getAnimes).not.toHaveBeenCalled();
    expect(result.current.feedback).toEqual({
      status: 'accent',
      title: 'Restore not needed',
      description: 'No changes were needed. Current version: 41.',
    });
  });

  it('shows conflict authority and identity, never success, and refetches only AnimeDetail', async () => {
    const getAnimeDetail = vi.fn().mockResolvedValueOnce(populatedDetail).mockResolvedValueOnce({
      ...populatedDetail,
      modified_at: 42,
    });
    const repeatAnime = vi.fn().mockResolvedValue({
      status: 'ok',
      outcome: 'conflict',
      modifiedAt: 42,
      conflictId: 'conflict-7',
    });
    const source = createSource(populatedDetail, { getAnimeDetail, repeatAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(getAnimeDetail).toHaveBeenCalledTimes(2);
    expect(source.getAnimes).not.toHaveBeenCalled();
    expect(result.current.feedback).toEqual({
      status: 'warning',
      title: 'Repeat not applied',
      description: 'The anime changed before Repeat could be applied. Current version: 42. Conflict: conflict-7.',
    });
    expect(result.current.feedback?.title).not.toContain('success');
  });

  it('reports a missing record failure without success or refetch', async () => {
    const repeatAnime = vi.fn().mockResolvedValue({
      status: 'error',
      message: 'anime not found',
      modifiedAt: 0,
    });
    const source = createSource(populatedDetail, { repeatAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(source.getAnimeDetail).toHaveBeenCalledTimes(1);
    expect(source.getAnimes).not.toHaveBeenCalled();
    expect(result.current.feedback).toEqual({
      status: 'danger',
      title: 'Repeat failed',
      description: 'anime not found',
    });
  });

  it('keeps an applied outcome accurate when the required Detail refetch fails', async () => {
    const getAnimeDetail = vi.fn()
      .mockResolvedValueOnce(populatedDetail)
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    const repeatAnime = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 11 });
    const source = createSource(populatedDetail, { getAnimeDetail, repeatAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(getAnimeDetail).toHaveBeenCalledTimes(2);
    expect(result.current.feedback).toEqual({
      status: 'warning',
      title: 'Repeat applied',
      description: 'Repeat was applied. Current version: 11. Anime Detail could not be refreshed.',
    });
    expect(result.current.feedback?.title).not.toBe('Repeat failed');
  });

  it.each([
    {
      label: 'applied',
      currentDetail: populatedDetail,
      action: 'repeat' as const,
      mutationResult: { status: 'ok', outcome: 'applied', modifiedAt: 11 },
      expectedTitle: 'Repeat applied',
      expectedDescription: 'Repeat was applied. Current version: 11. Anime Detail could not be refreshed.',
    },
    {
      label: 'no-op',
      currentDetail: { ...populatedDetail, activo: 0, modified_at: 41 },
      action: 'restore' as const,
      mutationResult: { status: 'ok', outcome: 'no_op', modifiedAt: 41 },
      expectedTitle: 'Restore not needed',
      expectedDescription: 'No changes were needed. Current version: 41. Anime Detail could not be refreshed.',
    },
    {
      label: 'conflict',
      currentDetail: populatedDetail,
      action: 'repeat' as const,
      mutationResult: {
        status: 'ok',
        outcome: 'conflict',
        modifiedAt: 42,
        conflictId: 'conflict-null-refresh',
      },
      expectedTitle: 'Repeat not applied',
      expectedDescription: 'The anime changed before Repeat could be applied. Current version: 42. Conflict: conflict-null-refresh. Anime Detail could not be refreshed.',
    },
  ])('preserves the prior Detail and $label feedback when refresh resolves null', async ({
    currentDetail,
    action,
    mutationResult,
    expectedTitle,
    expectedDescription,
  }) => {
    const getAnimeDetail = vi.fn().mockResolvedValueOnce(currentDetail).mockResolvedValueOnce(null);
    const repeatAnime = vi.fn().mockResolvedValue(mutationResult);
    const restoreAnime = vi.fn().mockResolvedValue(mutationResult);
    const source = createSource(currentDetail, { getAnimeDetail, repeatAnime, restoreAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      if (action === 'repeat') {
        result.current.onRequestRepeat();
      } else {
        result.current.onRequestRestore();
      }
    });
    await act(async () => result.current.onConfirmAction());

    expect(getAnimeDetail).toHaveBeenCalledTimes(2);
    expect(source.getAnimes).not.toHaveBeenCalled();
    expect(result.current.loadState).toBe('loaded');
    expect(result.current.detail?.nombre).toBe(currentDetail.nombre);
    expect(result.current.detail?.modifiedAt).toBe(currentDetail.modified_at);
    expect(result.current.feedback).toEqual({
      status: 'warning',
      title: expectedTitle,
      description: expectedDescription,
    });
  });

  it('fails closed when the selected runtime binding is unavailable', async () => {
    const source = createSource(populatedDetail, { repeatAnime: undefined });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(result.current.feedback?.status).toBe('danger');
    expect(result.current.feedback?.description).toContain('unavailable');
    expect(source.getAnimeDetail).toHaveBeenCalledTimes(1);
  });
});
