import { act, renderHook } from '@testing-library/react';
import { waitFor } from '../../AnimeEditorWorkspace/__tests__/wait-for.test-support';
import { describe, expect, it, vi } from 'vitest';
import type {
  EpisodeDurationRequest,
  EpisodeDurationRuntimeSource,
  EpisodeReanalysisProgress,
  EpisodeReanalysisReview,
} from '../../../../../shared/contracts/episode-durations.types';
import type { EpisodeDurationEdit } from '../../../../../shared/contracts/anime.types';
import { createBridgeQueryTestWrapper } from '../../../../../shared/query/test-support/bridge-query.test-support';
import type { UseEpisodeReanalysisOptions } from '../episode-durations-section.types';
import { useEpisodeReanalysis } from '../use-episode-reanalysis';

/**
 * A fresh query wrapper: the re-analysis and its cancel run as bridge mutations.
 * @returns The wrapper component.
 */
function queryWrapper() {
  return createBridgeQueryTestWrapper().wrapper;
}

/**
 * Lets started mutations reach their command and settled ones reach the hook:
 * a bridge mutation calls its command a few microtasks after it starts.
 * @returns When every pending microtask ran.
 */
async function flushMutations(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** The draft's view of the anime under analysis. */
const REQUEST: EpisodeDurationRequest = { animeId: 'anime-1', folder: 'D:/Anime/Oshi no Ko', totalEpisodes: 12, kind: 0 };

/** A review with one update and one manual-kept row. */
const REVIEW: EpisodeReanalysisReview = {
  outcome: 'ok', status: 'ok', filesRecognized: 2,
  rows: [
    { episode: 4, basename: 'e04.mkv', currentMs: 1_380_000, currentMinutes: 23, currentSource: 'measured', measuredMs: 2_760_000, measuredMinutes: 46, result: 'update' },
    { episode: 6, basename: 'e06.mkv', currentMs: 1_440_000, currentMinutes: 24, currentSource: 'manual', measuredMs: 2_820_000, measuredMinutes: 47, result: 'manual_kept' },
  ],
};

/** A fake source whose re-analysis the test settles, and whose progress it emits. */
interface Harness {
  readonly source: EpisodeDurationRuntimeSource;
  readonly settle: (review: EpisodeReanalysisReview) => void;
  readonly emit: (progress: EpisodeReanalysisProgress) => void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
}

/**
 * Builds a source whose re-analysis stays pending until `settle`.
 * @returns The harness.
 */
function createHarness(): Harness {
  let settle: (review: EpisodeReanalysisReview) => void = () => undefined;
  let listener: (progress: EpisodeReanalysisProgress) => void = () => undefined;
  const unsubscribe = vi.fn();
  const source: EpisodeDurationRuntimeSource = {
    getEpisodeDurationSection: vi.fn(),
    reanalyzeEpisodeDurations: vi.fn(() => new Promise<EpisodeReanalysisReview>((resolve) => { settle = resolve; })),
    cancelEpisodeReanalysis: vi.fn().mockResolvedValue(undefined),
    saveEpisodeDurations: vi.fn(),
    onEpisodeReanalysisProgress: vi.fn((next: (progress: EpisodeReanalysisProgress) => void) => { listener = next; return unsubscribe; }),
  };
  return { source, settle: (review) => settle(review), emit: (progress) => listener(progress), unsubscribe };
}

/**
 * Builds the hook options.
 * @param source The fake source.
 * @param overrides Fields to replace.
 * @returns The options.
 */
function options(source: EpisodeDurationRuntimeSource, overrides: Partial<UseEpisodeReanalysisOptions> = {}): UseEpisodeReanalysisOptions {
  return { request: REQUEST, edits: [], onEditsChange: vi.fn(), source, ...overrides };
}

describe('useEpisodeReanalysis', () => {
  it('confirms nothing while no review is open; runs the draft folder, keeps this anime progress only, opens the review, closes it without touching the draft, and confirms a later review into the draft, never the manual-kept rows', async () => {
    const harness = createHarness();
    const onEditsChange = vi.fn();
    const existing: readonly EpisodeDurationEdit[] = [{ episode: 2, durationMs: 1_500_000, source: 'manual', clear: false }];
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source, { edits: existing, onEditsChange })), { wrapper: queryWrapper() });

    act(() => result.current.onConfirmReview());
    expect(onEditsChange).not.toHaveBeenCalled();

    act(() => { void result.current.onReanalyze(); });
    await flushMutations();
    expect(result.current.analysis.isRunning).toBe(true);
    act(() => {
      harness.emit({ animeId: 'other', index: 9, total: 9, episode: 9 });
      harness.emit({ animeId: 'anime-1', index: 5, total: 12, episode: 5 });
    });
    expect(result.current.analysis.progress).toEqual({ animeId: 'anime-1', index: 5, total: 12, episode: 5 });
    // Another anime reporting after this one keeps this anime progress.
    act(() => harness.emit({ animeId: 'other', index: 9, total: 9, episode: 9 }));
    expect(result.current.analysis.progress).toEqual({ animeId: 'anime-1', index: 5, total: 12, episode: 5 });
    await act(async () => harness.settle(REVIEW));
    await flushMutations();

    expect(harness.source.reanalyzeEpisodeDurations).toHaveBeenCalledWith(REQUEST);
    expect(result.current.analysis).toEqual({ isRunning: false });
    expect(result.current.review?.confirmLabel).toBe('Confirm 1 change');
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);

    // Closing a review leaves the draft alone.
    act(() => result.current.onCloseReview());

    expect(result.current.review).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();

    // Confirming a review merges the changes into the draft and closes it.
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();
    await act(async () => harness.settle(REVIEW));
    await flushMutations();

    act(() => result.current.onConfirmReview());

    expect(onEditsChange).toHaveBeenCalledExactlyOnceWith([existing[0], { episode: 4, durationMs: 2_760_000, source: 'measured', clear: false }]);
    expect(result.current.review).toBeUndefined();
  });

  it('tries again from an interrupted review, then cancels through the binding, and a cancelled run opens no review', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source)), { wrapper: queryWrapper() });
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();
    await act(async () => harness.settle({ ...REVIEW, status: 'interrupted' }));
    await flushMutations();
    expect(result.current.review?.canTryAgain).toBe(true);

    act(() => { void result.current.onReanalyze(); });
    await flushMutations();

    expect(result.current.review).toBeUndefined();
    expect(result.current.analysis.isRunning).toBe(true);
    expect(harness.source.reanalyzeEpisodeDurations).toHaveBeenCalledTimes(2);

    act(() => result.current.onCancelAnalysis());
    await flushMutations();
    await act(async () => harness.settle({ ...REVIEW, status: 'cancelled' }));
    await flushMutations();

    expect(harness.source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
    expect(result.current.review).toBeUndefined();
    expect(result.current.analysis.isRunning).toBe(false);
  });

  it('shows a thrown binding failure as an error review', async () => {
    const harness = createHarness();
    vi.mocked(harness.source.reanalyzeEpisodeDurations).mockRejectedValueOnce(new Error('bridge gone'));
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source)), { wrapper: queryWrapper() });

    await act(async () => result.current.onReanalyze());

    expect(result.current.review).toEqual(expect.objectContaining({ alertStatus: 'danger', description: 'bridge gone' }));
    expect(result.current.analysis.isRunning).toBe(false);
  });

  it('does nothing without a loaded anime', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source, { request: undefined })), { wrapper: queryWrapper() });

    await act(async () => result.current.onReanalyze());

    expect(harness.source.reanalyzeEpisodeDurations).not.toHaveBeenCalled();
  });

  it('drops a run when the Editor moves to another anime, and cancels it', async () => {
    const harness = createHarness();
    const { result, rerender } = renderHook((props: UseEpisodeReanalysisOptions) => useEpisodeReanalysis(props), { initialProps: options(harness.source), wrapper: queryWrapper() });
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();

    rerender(options(harness.source, { request: { ...REQUEST, animeId: 'anime-2' } }));
    await act(async () => harness.settle(REVIEW));
    await flushMutations();

    await waitFor(() => expect(harness.source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1));
    expect(result.current.review).toBeUndefined();
    expect(result.current.analysis.isRunning).toBe(false);
  });
});

/** One started run: its answer, its failure, and its progress listener. */
interface Run {
  readonly settle: (review: EpisodeReanalysisReview) => void;
  readonly reject: (error: Error) => void;
  readonly emit: (progress: EpisodeReanalysisProgress) => void;
}

/**
 * Builds a source that keeps every run, so a test can answer a run a newer one replaced.
 * @returns The source and its runs, in start order.
 */
function createRunsSource(): { readonly source: EpisodeDurationRuntimeSource; readonly runs: Run[] } {
  const runs: Run[] = [];
  let listener: (progress: EpisodeReanalysisProgress) => void = () => undefined;
  const source: EpisodeDurationRuntimeSource = {
    getEpisodeDurationSection: vi.fn(),
    onEpisodeReanalysisProgress: vi.fn((next: (progress: EpisodeReanalysisProgress) => void) => { listener = next; return () => undefined; }),
    reanalyzeEpisodeDurations: vi.fn(() => new Promise<EpisodeReanalysisReview>((resolve, reject) => { runs.push({ settle: resolve, reject, emit: listener }); })),
    cancelEpisodeReanalysis: vi.fn().mockResolvedValue(undefined),
    saveEpisodeDurations: vi.fn(),
  };
  return { source, runs };
}

/**
 * Returns one started run.
 * @param runs The started runs.
 * @param index Its start order.
 * @returns The run.
 */
function runAt(runs: readonly Run[], index: number): Run {
  const run = runs[index];
  if (run === undefined) throw new Error(`run ${index} never started`);
  return run;
}

describe('useEpisodeReanalysis with a replaced run', () => {
  it('ignores the progress, the answer and the failure of a run a newer run replaced', async () => {
    const { source, runs } = createRunsSource();
    const { result } = renderHook(() => useEpisodeReanalysis(options(source)), { wrapper: queryWrapper() });
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();

    act(() => runAt(runs, 0).emit({ animeId: 'anime-1', index: 3, total: 12, episode: 3 }));
    await act(async () => runAt(runs, 0).settle(REVIEW));
    await flushMutations();
    expect(result.current.analysis).toEqual({ isRunning: true });
    expect(result.current.review).toBeUndefined();
    await act(async () => runAt(runs, 1).settle(REVIEW));
    await flushMutations();

    expect(result.current.analysis).toEqual({ isRunning: false });
    expect(result.current.review?.confirmLabel).toBe('Confirm 1 change');

    // The failure of a replaced run is ignored too.
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();

    await act(async () => runAt(runs, 2).reject(new Error('stale')));
    await flushMutations();
    expect(result.current.review).toBeUndefined();
    await act(async () => runAt(runs, 3).reject(new Error('disk gone')));
    await flushMutations();

    expect(result.current.review?.description).toBe('disk gone');
  });
});

describe('useEpisodeReanalysis cancel on leave', () => {
  it('cancels nothing when it unmounts with no run going', async () => {
    const { source, runs } = createRunsSource();
    const idle = renderHook(() => useEpisodeReanalysis(options(source)), { wrapper: queryWrapper() });
    idle.unmount();
    const finished = renderHook(() => useEpisodeReanalysis(options(source)), { wrapper: queryWrapper() });
    act(() => { void finished.result.current.onReanalyze(); });
    await flushMutations();
    await act(async () => runAt(runs, 0).settle(REVIEW));
    await flushMutations();

    finished.unmount();
    await flushMutations();

    expect(source.cancelEpisodeReanalysis).not.toHaveBeenCalled();
  });

  it('cancels a run once, even when the Editor moves on and then closes', async () => {
    const { source } = createRunsSource();
    const { result, rerender, unmount } = renderHook((props: UseEpisodeReanalysisOptions) => useEpisodeReanalysis(props), { initialProps: options(source), wrapper: queryWrapper() });
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();

    rerender(options(source, { request: { ...REQUEST, animeId: 'anime-2' } }));
    unmount();
    await flushMutations();

    expect(source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
  });
});

describe('useEpisodeReanalysis with a changing draft', () => {
  it('re-analyzes the draft as it is now, and cancels through the current source', async () => {
    const first = createRunsSource();
    const second = createRunsSource();
    const { result, rerender } = renderHook((props: UseEpisodeReanalysisOptions) => useEpisodeReanalysis(props), { initialProps: options(first.source), wrapper: queryWrapper() });
    const moved = { ...REQUEST, folder: 'D:/Anime/Moved' };

    rerender(options(second.source, { request: moved }));
    act(() => { void result.current.onReanalyze(); });
    await flushMutations();
    act(() => result.current.onCancelAnalysis());
    await flushMutations();

    expect(second.source.reanalyzeEpisodeDurations).toHaveBeenCalledWith(moved);
    expect(second.source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
    expect(first.source.cancelEpisodeReanalysis).not.toHaveBeenCalled();
  });
});
