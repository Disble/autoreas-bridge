import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ReactRouter from 'react-router';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import { useAnimeDetail } from '../use-anime-detail';

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

/** Builds a minimal `BridgeRuntimeSource` fixture, letting each case override individual members. */
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
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    restoreAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    repeatAnime: vi.fn().mockResolvedValue({ status: 'ok', outcome: 'applied', modifiedAt: 1 }),
    ...overrides,
  };
}

/** Pending per-anime fetches held by `createDeferredDetailSource`. */
type DeferredById = Map<
  string,
  { resolve: (value: AnimeDetail | null) => void; reject: (reason: unknown) => void }
>;

/** Builds a source whose detail fetch stays pending per animeId until the case settles it. */
function createDeferredDetailSource(): {
  source: BridgeRuntimeSource;
  deferredById: DeferredById;
} {
  const deferredById: DeferredById = new Map();
  const getAnimeDetail = vi.fn().mockImplementation(
    (animeId: string) => new Promise<AnimeDetail | null>((resolve, reject) => {
      deferredById.set(animeId, { resolve, reject });
    }),
  );
  return { source: createSource(populatedDetail, { getAnimeDetail }), deferredById };
}

/** One deferred settlement: either a resolution value or a rejection reason. */
type DeferredSettlement =
  | { kind: 'resolve'; value: AnimeDetail | null }
  | { kind: 'reject'; reason: unknown };

/** Renders the hook for one anime without waiting; cases drive the change themselves. */
function renderChangeHarness(source: BridgeRuntimeSource, initialId: string) {
  return renderHook(({ animeId }: { animeId: string }) => useAnimeDetail({ animeId }, source), {
    initialProps: { animeId: initialId },
  });
}

/** Renders the hook and waits until the initial anime is loaded. */
async function renderLoadedDetail(source: BridgeRuntimeSource, initialId = 'anime-1') {
  const utils = renderChangeHarness(source, initialId);
  await waitFor(() => expect(utils.result.current.loadState).toBe('loaded'));
  return utils;
}

/** Moves to another anime and waits until its detail fetch fires. */
async function moveToAnime(
  harness: { rerender: (props: { animeId: string }) => void },
  source: BridgeRuntimeSource,
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

/** Returning to a dropped anime re-fires its fetch instead of showing stale state. */
function expectRefireLoading(source: BridgeRuntimeSource, loadState: string, detail: unknown): void {
  expect(source.getAnimeDetail).toHaveBeenCalledTimes(3);
  expect(loadState).toBe('loading');
  expect(detail).toBeUndefined();
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

  it('deep-links Edit anime to the current id after an animeId change', async () => {
    const source = createSource(populatedDetail);
    const { result, rerender } = await renderLoadedDetail(source);

    rerender({ animeId: 'anime-2' });
    await waitFor(() => expect(source.getAnimeDetail).toHaveBeenLastCalledWith('anime-2'));

    act(() => {
      result.current.onEditAnime();
    });

    expect(navigateMock).toHaveBeenCalledWith('/editor/anime-2');
  });

  it('drops a superseded resolution so returning shows loading instead of stale detail', async () => {
    const { source, deferredById } = createDeferredDetailSource();
    const utils = renderChangeHarness(source, 'anime-1');

    await moveToAnime(utils, source, 'anime-2');
    await settleDeferred(deferredById, 'anime-1', { kind: 'resolve', value: populatedDetail });
    expectDroppedCommit(utils.result.current.loadState, utils.result.current.detail);

    utils.rerender({ animeId: 'anime-1' });
    expectRefireLoading(source, utils.result.current.loadState, utils.result.current.detail);
  });

  it('drops a superseded rejection so returning shows loading instead of stale not-found', async () => {
    const { source, deferredById } = createDeferredDetailSource();
    const utils = renderChangeHarness(source, 'anime-1');

    await moveToAnime(utils, source, 'anime-2');
    await settleDeferred(deferredById, 'anime-1', { kind: 'reject', reason: new Error('superseded fetch failed') });
    expectDroppedCommit(utils.result.current.loadState, utils.result.current.detail);

    utils.rerender({ animeId: 'anime-1' });
    expectRefireLoading(source, utils.result.current.loadState, utils.result.current.detail);
  });

  it('reports not-found when the initial fetch rejects', async () => {
    const { source, deferredById } = createDeferredDetailSource();
    const utils = renderChangeHarness(source, 'anime-1');

    await settleDeferred(deferredById, 'anime-1', { kind: 'reject', reason: new Error('detail unavailable') });
    await waitFor(() => expect(utils.result.current.loadState).toBe('not-found'));

    expect(utils.result.current.detail).toBeUndefined();
  });
});
