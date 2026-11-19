import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import * as HeroUI from '@heroui/react';
import * as ReactRouter from 'react-router';
import type { AnimeDesktopActionResult } from '../../../../../shared/contracts/anime-editor-source.types';
import type { AnimeSource } from '../../../../../shared/contracts/anime-source.types';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import type { AnimeDetailCommandSource } from '../anime-detail.types';
import { useAnimeDetail } from '../use-anime-detail';

/** The reads and the commands the Detail page runs, as one fixture. */
type DetailFixture = AnimeSource & AnimeDetailCommandSource;

/**
 * Spy instead of `vi.mock`: with `deps.optimizer` enabled, `importOriginal`-based
 * partial mocks cannot re-import the original module.
 */
const navigateMock = vi.fn();

/** Baseline loaded detail with a repetition entry, reused and overridden per case. */
const populatedDetail: AnimeDetail = {
  id: 'anime-1',
  name: 'Frieren',
  status: 2,
  episodesWatched: 12,
  totalEpisodes: 28,
  active: 1,
  firstCycle: 1,
  days: [],
  genres: ['Fantasy'],
  modified_at: 0,
  repetitions: [{ numRepetitions: 1, episodesWatched: 24, status: 1, repeatedAt: Date.UTC(2022, 0, 1) }],
};

/**
 * Builds the anime reads and the commands as one fixture, letting each case
 * override individual members; a `null` detail rejects as an unknown anime.
 */
function createSource(
  resolvedValue: AnimeDetail | null,
  overrides: Partial<DetailFixture> = {},
): DetailFixture {
  return {
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeDetail: resolvedValue === null
      ? vi.fn().mockRejectedValue(createBridgeError('not_found', 'anime not found'))
      : vi.fn().mockResolvedValue(resolvedValue),
    getWatchHistoryPage: vi.fn(),
    getAnimeWatchHistoryPage: vi.fn(),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    restoreAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    repeatAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    ...overrides,
  };
}

/**
 * A query wrapper reporting the `anime` module, ready by default.
 * @param anime The `anime` module's readiness.
 * @returns The wrapper and `emit`, which pushes a readiness change.
 */
function modules(anime: ModuleReadiness = { module: 'anime', state: 'ready' }) {
  return createModulesTestWrapper(anime);
}

/**
 * Replaces one of the anime module's desktop actions, which Detail runs by
 * default, for the current test only.
 * @param name The desktop action.
 * @param action Its stand-in.
 */
function stubDesktopAction(name: 'copyAnimeFolder' | 'openAnimePage', action: (animeId: string) => Promise<AnimeDesktopActionResult>) {
  const spy = vi.spyOn(BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE, name).mockImplementation(action);
  onTestFinished(() => spy.mockRestore());
}

describe('useAnimeDetail', () => {
  beforeEach(() => {
    vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(navigateMock);
    navigateMock.mockClear();
    window.history.replaceState(null, '');
  });

  it('loads from a cover-free loading state to the view model, raw source and placeholder cover', async () => {
    const getAnimeCover = vi.fn();
    const source = createSource(populatedDetail, { getAnimeCover });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());

    expect(result.current.loadState).toBe('loading');
    expect(result.current.detail).toBeUndefined();
    expect(getAnimeCover).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.detail).toBeDefined();
    expect(result.current.detailSource).toEqual(populatedDetail);
    expect(source.getAnimeDetail).toHaveBeenCalledWith('anime-1');
    // The detail has no stored cover, so the cover resolves as a placeholder.
    expect(result.current.cover).toEqual({ status: 'placeholder' });
  });

  it('returns not-found when the id does not resolve to a record', async () => {
    const source = createSource(null);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'missing-id' }, source, source), modules());

    await waitFor(() => expect(result.current.loadState).toBe('not-found'));

    expect(result.current.detail).toBeUndefined();
  });

  it('stays loading without reading while the anime module starts, then loads once ready', async () => {
    const source = createSource(populatedDetail);
    const { wrapper, emit } = modules({ module: 'anime', state: 'starting' });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), { wrapper });
    await act(async () => {});

    expect(result.current).toMatchObject({ loadState: 'loading', detail: undefined, failureMessage: undefined });
    expect(source.getAnimeDetail).not.toHaveBeenCalled();

    act(() => emit({ module: 'anime', state: 'ready' }));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
  });

  it.each<[string, ModuleReadiness, Partial<DetailFixture>, string]>([
    ['the anime module failed', { module: 'anime', state: 'failed', reason: 'anime: db closed' }, {}, 'anime: db closed'],
    ['the read failed', { module: 'anime', state: 'ready' }, { getAnimeDetail: vi.fn().mockRejectedValue(createBridgeError('internal', 'read failed')) }, 'read failed'],
  ])('shows the failure, never not-found, when %s', async (_label, anime, overrides, message) => {
    const source = createSource(populatedDetail, overrides);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules(anime));

    await waitFor(() => expect(result.current.loadState).toBe('failure'));
    expect(result.current).toMatchObject({ failureMessage: message, detail: undefined, detailSource: undefined });
  });

  it('re-fetches when the animeId prop changes', async () => {
    const source = createSource(populatedDetail);
    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeDetail({ animeId }, source, source),
      { initialProps: { animeId: 'anime-1' }, ...modules() },
    );

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    rerender({ animeId: 'anime-2' });

    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenLastCalledWith('anime-2'));
  });

  it('resolves the cover via getAnimeCover, then folds a later onPortadaError into a placeholder', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' });
    const source = createSource(
      { ...populatedDetail, cover: 'C:/legacy/portadas/frieren.jpg' },
      { getAnimeCover },
    );
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    await waitFor(() => expect(result.current.cover).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' }));
    expect(getAnimeCover).toHaveBeenCalledWith('anime-1');

    act(() => {
      result.current.onPortadaError();
    });

    expect(result.current.cover).toEqual({ status: 'placeholder' });
  });

  it('resets the portada-error fold when the animeId prop changes', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' });
    const source = createSource(
      { ...populatedDetail, cover: 'C:/legacy/portadas/frieren.jpg' },
      { getAnimeCover },
    );
    const { rerender, result } = renderHook(
      ({ animeId }: { animeId: string }) => useAnimeDetail({ animeId }, source, source),
      { initialProps: { animeId: 'anime-1' }, ...modules() },
    );

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    await waitFor(() => expect(result.current.cover).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' }));

    act(() => {
      result.current.onPortadaError();
    });
    expect(result.current.cover).toEqual({ status: 'placeholder' });

    rerender({ animeId: 'anime-2' });

    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenLastCalledWith('anime-2'));
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    await waitFor(() => expect(result.current.cover).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' }));
  });

  it('keeps the cover on a nonzero-width load and folds a zero-width load into a placeholder', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' });
    const source = createSource(
      { ...populatedDetail, cover: 'C:/legacy/portadas/frieren.jpg' },
      { getAnimeCover },
    );
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    await waitFor(() => expect(result.current.cover).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' }));

    act(() => {
      result.current.onPortadaLoad({ currentTarget: { naturalWidth: 96 } } as never);
    });

    expect(result.current.cover).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' });

    act(() => {
      result.current.onPortadaLoad({ currentTarget: { naturalWidth: 0 } } as never);
    });

    expect(result.current.cover).toEqual({ status: 'placeholder' });
  });

  it('navigates Back to /history without a previous entry and Edit to /editor/:id', async () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      result.current.onBack();
    });

    expect(navigateMock).toHaveBeenCalledWith('/history');

    act(() => {
      result.current.onEditAnime();
    });

    expect(navigateMock).toHaveBeenCalledWith('/editor/anime-1');
  });

  it('calls navigate(-1) when a previous history entry exists', async () => {
    window.history.replaceState({ idx: 1 }, '');
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => {
      result.current.onBack();
    });

    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it.each([
    ['success', () => Promise.resolve({ status: 'ok' }), 'Folder path copied'],
    ['danger', () => Promise.reject(createBridgeError('invalid_argument', 'anime anime-1 has no folder')), 'Could not copy the folder path'],
  ] as const)('copies the folder through the anime module and raises a %s toast', async (status, copyResult, message) => {
    const toastSpy = vi.spyOn(HeroUI.toast, status).mockReturnValue('toast-1');
    const copyAnimeFolder = vi.fn(copyResult);
    stubDesktopAction('copyAnimeFolder', copyAnimeFolder);
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    await act(async () => {
      await result.current.onCopyFolder();
    });

    expect(copyAnimeFolder).toHaveBeenCalledWith('anime-1');
    expect(toastSpy).toHaveBeenCalledWith(message);
  });

  it('opens the page through the anime module for the current anime, silent on success and with a danger toast on a rejection', async () => {
    const successSpy = vi.spyOn(HeroUI.toast, 'success').mockReturnValue('toast-1');
    const dangerSpy = vi.spyOn(HeroUI.toast, 'danger').mockReturnValue('toast-2');
    successSpy.mockClear();
    dangerSpy.mockClear();
    const openAnimePage = vi.fn()
      .mockResolvedValueOnce({ status: 'ok' })
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValueOnce(createBridgeError('unavailable', 'anime is starting'));
    stubDesktopAction('openAnimePage', openAnimePage);
    const source = createSource(populatedDetail);
    const { result, rerender } = renderHook(
      ({ animeId }) => useAnimeDetail({ animeId }, source, source),
      { initialProps: { animeId: 'anime-2' }, ...modules() },
    );
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    await act(async () => {
      await result.current.onOpenPage();
    });
    expect(openAnimePage).toHaveBeenLastCalledWith('anime-2');

    rerender({ animeId: 'anime-1' });
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    await act(async () => {
      await result.current.onOpenPage();
    });
    expect(openAnimePage).toHaveBeenLastCalledWith('anime-1');
    expect(successSpy).not.toHaveBeenCalled();
    expect(dangerSpy).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.onOpenPage();
    });
    expect(dangerSpy).toHaveBeenCalledWith('Could not open the page');
  });

  it('cancels an explicit confirmation without invoking either binding', async () => {
    const source = createSource(populatedDetail);
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    expect(result.current.confirmation?.action).toBe('repeat');
    act(() => result.current.onCancelAction());

    expect(result.current.confirmation).toBeUndefined();
    expect(source.restoreAnime).not.toHaveBeenCalled();
    expect(source.repeatAnime).not.toHaveBeenCalled();
  });

  it('sends the exact zero detail token for Repeat and refetches AnimeDetail only after applied', async () => {
    const refreshed = { ...populatedDetail, status: 0, modified_at: 11 };
    const getAnimeDetail = vi.fn()
      .mockResolvedValueOnce(populatedDetail)
      .mockResolvedValueOnce(refreshed);
    const repeatAnime = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 11 });
    const source = createSource(populatedDetail, { getAnimeDetail, repeatAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
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
    const inactive = { ...populatedDetail, active: 0, modified_at: 41 };
    const refreshed = { ...inactive, active: 1 };
    const getAnimeDetail = vi.fn().mockResolvedValueOnce(inactive).mockResolvedValueOnce(refreshed);
    const restoreAnime = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'no_op', modifiedAt: 41 });
    const source = createSource(inactive, { getAnimeDetail, restoreAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
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
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
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
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
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
      .mockRejectedValueOnce(createBridgeError('internal', 'refresh unavailable'));
    const repeatAnime = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 11 });
    const source = createSource(populatedDetail, { getAnimeDetail, repeatAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
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
      currentDetail: { ...populatedDetail, active: 0, modified_at: 41 },
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
  ])('preserves the prior Detail and $label feedback when the refresh finds no anime', async ({
    currentDetail,
    action,
    mutationResult,
    expectedTitle,
    expectedDescription,
  }) => {
    const getAnimeDetail = vi.fn()
      .mockResolvedValueOnce(currentDetail)
      .mockRejectedValueOnce(createBridgeError('not_found', 'anime not found'));
    const repeatAnime = vi.fn().mockResolvedValue(mutationResult);
    const restoreAnime = vi.fn().mockResolvedValue(mutationResult);
    const source = createSource(currentDetail, { getAnimeDetail, repeatAnime, restoreAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
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
    expect(result.current.detail?.nombre).toBe(currentDetail.name);
    expect(result.current.detail?.modifiedAt).toBe(currentDetail.modified_at);
    expect(result.current.feedback).toEqual({
      status: 'warning',
      title: expectedTitle,
      description: expectedDescription,
    });
  });

  it('fails closed with the episodes port reason when the selected binding is not attached', async () => {
    const repeatAnime = vi.fn().mockRejectedValue(createBridgeError('unavailable', 'the RepeatAnime binding is not attached'));
    const source = createSource(populatedDetail, { repeatAnime });
    const { result } = renderHook(() => useAnimeDetail({ animeId: 'anime-1' }, source, source), modules());
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    act(() => result.current.onRequestRepeat());
    await act(async () => result.current.onConfirmAction());

    expect(result.current.feedback?.status).toBe('danger');
    expect(result.current.feedback?.description).toBe('the RepeatAnime binding is not attached');
    expect(source.getAnimeDetail).toHaveBeenCalledTimes(1);
  });
});
