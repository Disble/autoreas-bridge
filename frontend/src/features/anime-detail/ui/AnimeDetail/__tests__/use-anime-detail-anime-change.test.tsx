import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import * as ReactRouter from 'react-router';
import type { AnimeSource } from '../../../../../shared/contracts/anime-source.types';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
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

/** Builds the anime reads and the commands as one fixture, letting each case override individual members. */
function createSource(
  resolvedValue: AnimeDetail,
  overrides: Partial<DetailFixture> = {},
): DetailFixture {
  return {
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeDetail: vi.fn().mockResolvedValue(resolvedValue),
    getWatchHistoryPage: vi.fn(),
    getAnimeWatchHistoryPage: vi.fn(),
    getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }),
    restoreAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    repeatAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    ...overrides,
  };
}

/** Pending per-anime fetches held by `createDeferredDetailSource`. */
type DeferredById = Map<
  string,
  { resolve: (value: AnimeDetail) => void; reject: (reason: unknown) => void }
>;

/** Builds a source whose detail fetch stays pending per animeId until the case settles it. */
function createDeferredDetailSource(): {
  source: DetailFixture;
  deferredById: DeferredById;
} {
  const deferredById: DeferredById = new Map();
  const getAnimeDetail = vi.fn().mockImplementation(
    (animeId: string) => new Promise<AnimeDetail>((resolve, reject) => {
      deferredById.set(animeId, { resolve, reject });
    }),
  );
  return { source: createSource(populatedDetail, { getAnimeDetail }), deferredById };
}

/** One deferred settlement: either a resolution value or a rejection reason. */
type DeferredSettlement =
  | { kind: 'resolve'; value: AnimeDetail }
  | { kind: 'reject'; reason: unknown };

/** Renders the hook for one anime without waiting; cases drive the change themselves. */
function renderChangeHarness(source: DetailFixture, initialId: string) {
  return renderHook(({ animeId }: { animeId: string }) => useAnimeDetail({ animeId }, source, source), {
    initialProps: { animeId: initialId },
    ...createModulesTestWrapper({ module: 'anime', state: 'ready' }),
  });
}

/** Renders the hook and waits until the initial anime is loaded. */
async function renderLoadedDetail(source: DetailFixture, initialId = 'anime-1') {
  const utils = renderChangeHarness(source, initialId);
  await waitFor(() => expect(utils.result.current.loadState).toBe('loaded'));
  return utils;
}

/** Moves to another anime and waits until its detail fetch fires. */
async function moveToAnime(
  harness: { rerender: (props: { animeId: string }) => void },
  source: DetailFixture,
  targetId: string,
): Promise<void> {
  harness.rerender({ animeId: targetId });
  await waitFor(() => expect(source.getAnimeDetail).toHaveBeenLastCalledWith(targetId));
}

/** Settles one pending deferred fetch inside `act` so effects flush synchronously. */
async function settleDeferred(
  deferredById: DeferredById,
  animeId: string,
  settlement: DeferredSettlement,
): Promise<void> {
  await act(async () => {
    const pending = deferredById.get(animeId);
    if (settlement.kind === 'resolve') {
      pending?.resolve(settlement.value);
    } else {
      pending?.reject(settlement.reason);
    }
  });
}

/** A dropped superseded commit leaves the hook loading with no stale detail. */
function expectDroppedCommit(loadState: string, detail: unknown): void {
  expect(loadState).toBe('loading');
  expect(detail).toBeUndefined();
}

/** Returning to an anime whose read was superseded reads it again. */
async function expectRefire(source: DetailFixture): Promise<void> {
  await waitFor(() => expect(source.getAnimeDetail).toHaveBeenCalledTimes(3));
  expect(source.getAnimeDetail).toHaveBeenLastCalledWith('anime-1');
}

/**
 * Supersede and current-anime attribution for `useAnimeDetail`.
 *
 * Split from `use-anime-detail.test.tsx` under the repo 500-line rule: every
 * case here pins behavior across an `animeId` change (stale commits are
 * dropped, cover folds and navigation targets follow the current anime) or
 * the initial-fetch rejection path the supersede machinery shares.
 */
describe('useAnimeDetail anime change', () => {
  beforeEach(() => {
    vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(navigateMock);
    navigateMock.mockClear();
    window.history.replaceState(null, '');
  });

  it('marks the portada error against the current anime after an animeId change', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' });
    const source = createSource(
      { ...populatedDetail, cover: 'C:/legacy/portadas/frieren.jpg' },
      { getAnimeCover },
    );
    const utils = await renderLoadedDetail(source);

    await moveToAnime(utils, source, 'anime-2');
    await waitFor(() => expect(utils.result.current.loadState).toBe('loaded'));
    await waitFor(() => expect(utils.result.current.cover).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' }));

    act(() => {
      utils.result.current.onPortadaError();
    });

    expect(utils.result.current.cover).toEqual({ status: 'placeholder' });
  });

  it('marks a zero-width portada load against the current anime after an animeId change', async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' });
    const source = createSource(
      { ...populatedDetail, cover: 'C:/legacy/portadas/frieren.jpg' },
      { getAnimeCover },
    );
    const utils = await renderLoadedDetail(source);

    await moveToAnime(utils, source, 'anime-2');
    await waitFor(() => expect(utils.result.current.loadState).toBe('loaded'));
    await waitFor(() => expect(utils.result.current.cover).toEqual({ status: 'cover', dataUrl: 'data:image/jpeg;base64,ZmFrZQ==' }));

    act(() => {
      utils.result.current.onPortadaLoad({ currentTarget: { naturalWidth: 0 } } as never);
    });

    expect(utils.result.current.cover).toEqual({ status: 'placeholder' });
  });

  it('uses the latest navigate implementation for back navigation', async () => {
    const source = createSource(populatedDetail);
    const { result, rerender } = await renderLoadedDetail(source);

    const latestNavigate = vi.fn();
    vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(latestNavigate);
    rerender({ animeId: 'anime-1' });

    act(() => {
      result.current.onBack();
    });

    expect(latestNavigate).toHaveBeenCalledWith('/history');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('deep-links Edit anime and the desktop actions to the current id after an animeId change', async () => {
    const copyAnimeFolder = vi.spyOn(BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE, 'copyAnimeFolder').mockResolvedValue({ status: 'ok' });
    const openAnimePage = vi.spyOn(BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE, 'openAnimePage').mockResolvedValue({ status: 'ok' });
    onTestFinished(() => {
      copyAnimeFolder.mockRestore();
      openAnimePage.mockRestore();
    });
    const source = createSource(populatedDetail);
    const { result, rerender } = await renderLoadedDetail(source);

    rerender({ animeId: 'anime-2' });
    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenLastCalledWith('anime-2'));

    act(() => {
      result.current.onEditAnime();
    });

    expect(navigateMock).toHaveBeenCalledWith('/editor/anime-2');

    await act(async () => {
      await result.current.onCopyFolder();
      await result.current.onOpenPage();
    });

    expect(copyAnimeFolder).toHaveBeenCalledWith('anime-2');
    expect(openAnimePage).toHaveBeenCalledWith('anime-2');
  });

  it("never shows a superseded anime's late detail, and returning reads that anime again", async () => {
    const { source, deferredById } = createDeferredDetailSource();
    const utils = renderChangeHarness(source, 'anime-1');
    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenCalledWith('anime-1'));

    await moveToAnime(utils, source, 'anime-2');
    await settleDeferred(deferredById, 'anime-1', { kind: 'resolve', value: populatedDetail });
    expectDroppedCommit(utils.result.current.loadState, utils.result.current.detail);

    utils.rerender({ animeId: 'anime-1' });
    await expectRefire(source);
    await settleDeferred(deferredById, 'anime-1', { kind: 'resolve', value: populatedDetail });
    await waitFor(() => expect(utils.result.current.loadState).toBe('loaded'));
    expect(utils.result.current.detailSource).toEqual(populatedDetail);
  });

  it('drops a superseded rejection so returning shows loading instead of a stale failure', async () => {
    const { source, deferredById } = createDeferredDetailSource();
    const utils = renderChangeHarness(source, 'anime-1');
    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenCalledWith('anime-1'));

    await moveToAnime(utils, source, 'anime-2');
    await settleDeferred(deferredById, 'anime-1', { kind: 'reject', reason: createBridgeError('not_found', 'anime anime-1 not found') });
    expectDroppedCommit(utils.result.current.loadState, utils.result.current.detail);

    utils.rerender({ animeId: 'anime-1' });
    await expectRefire(source);
    expectDroppedCommit(utils.result.current.loadState, utils.result.current.detail);
  });

  it.each([
    ['not-found', createBridgeError('not_found', 'anime anime-1 not found'), undefined],
    ['failure', createBridgeError('internal', 'detail unavailable'), 'detail unavailable'],
  ])('reports %s when the initial fetch rejects with that code', async (loadState, reason, failureMessage) => {
    const { source, deferredById } = createDeferredDetailSource();
    const utils = renderChangeHarness(source, 'anime-1');
    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenCalledWith('anime-1'));

    await settleDeferred(deferredById, 'anime-1', { kind: 'reject', reason });
    await waitFor(() => expect(utils.result.current.loadState).toBe(loadState));

    expect(utils.result.current.detail).toBeUndefined();
    expect(utils.result.current.failureMessage).toBe(failureMessage);
  });
});
