import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  EpisodeDurationRequest,
  EpisodeDurationRuntimeSource,
  EpisodeReanalysisProgress,
  EpisodeReanalysisReview,
} from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../../shared/contracts/anime.types';
import type { UseEpisodeReanalysisOptions } from '../episode-durations-section.types';
import { useEpisodeReanalysis } from '../use-episode-reanalysis';

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
  it('runs the draft folder, reports this anime progress only, then opens the review', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source)));

    act(() => { void result.current.onReanalyze(); });
    expect(result.current.analysis.isRunning).toBe(true);
    act(() => {
      harness.emit({ animeId: 'other', index: 9, total: 9, episode: 9 });
      harness.emit({ animeId: 'anime-1', index: 5, total: 12, episode: 5 });
    });
    expect(result.current.analysis.progress).toEqual({ animeId: 'anime-1', index: 5, total: 12, episode: 5 });
    await act(async () => harness.settle(REVIEW));

    expect(harness.source.reanalyzeEpisodeDurations).toHaveBeenCalledWith(REQUEST);
    expect(result.current.analysis).toEqual({ isRunning: false });
    expect(result.current.review?.confirmLabel).toBe('Confirm 1 change');
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('confirms the changes into the draft, never the manual-kept rows, and closes', async () => {
    const harness = createHarness();
    const onEditsChange = vi.fn();
    const existing: readonly EpisodeDurationEdit[] = [{ episode: 2, durationMs: 1_500_000, source: 'manual', clear: false }];
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source, { edits: existing, onEditsChange })));
    act(() => { void result.current.onReanalyze(); });
    await act(async () => harness.settle(REVIEW));

    act(() => result.current.onConfirmReview());

    expect(onEditsChange).toHaveBeenCalledWith([existing[0], { episode: 4, durationMs: 2_760_000, source: 'measured', clear: false }]);
    expect(result.current.review).toBeUndefined();
  });

  it('closes a review without touching the draft', async () => {
    const harness = createHarness();
    const onEditsChange = vi.fn();
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source, { onEditsChange })));
    act(() => { void result.current.onReanalyze(); });
    await act(async () => harness.settle(REVIEW));

    act(() => result.current.onCloseReview());

    expect(result.current.review).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();
  });

  it('cancels through the binding, and a cancelled run opens no review', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source)));
    act(() => { void result.current.onReanalyze(); });

    act(() => result.current.onCancelAnalysis());
    await act(async () => harness.settle({ ...REVIEW, status: 'cancelled' }));

    expect(harness.source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
    expect(result.current.review).toBeUndefined();
    expect(result.current.analysis.isRunning).toBe(false);
  });

  it('tries again from an interrupted review', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source)));
    act(() => { void result.current.onReanalyze(); });
    await act(async () => harness.settle({ ...REVIEW, status: 'interrupted' }));
    expect(result.current.review?.canTryAgain).toBe(true);

    act(() => { void result.current.onReanalyze(); });

    expect(result.current.review).toBeUndefined();
    expect(result.current.analysis.isRunning).toBe(true);
    expect(harness.source.reanalyzeEpisodeDurations).toHaveBeenCalledTimes(2);
  });

  it('shows a thrown binding failure as an error review', async () => {
    const harness = createHarness();
    vi.mocked(harness.source.reanalyzeEpisodeDurations).mockRejectedValueOnce(new Error('bridge gone'));
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source)));

    await act(async () => result.current.onReanalyze());

    expect(result.current.review).toEqual(expect.objectContaining({ alertStatus: 'danger', description: 'bridge gone' }));
    expect(result.current.analysis.isRunning).toBe(false);
  });

  it('does nothing without a loaded anime', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useEpisodeReanalysis(options(harness.source, { request: undefined })));

    await act(async () => result.current.onReanalyze());

    expect(harness.source.reanalyzeEpisodeDurations).not.toHaveBeenCalled();
  });

  it('drops a run when the Editor moves to another anime, and cancels it', async () => {
    const harness = createHarness();
    const { result, rerender } = renderHook((props: UseEpisodeReanalysisOptions) => useEpisodeReanalysis(props), { initialProps: options(harness.source) });
    act(() => { void result.current.onReanalyze(); });

    rerender(options(harness.source, { request: { ...REQUEST, animeId: 'anime-2' } }));
    await act(async () => harness.settle(REVIEW));

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
  it('ignores the progress and the answer of a run a newer run replaced', async () => {
    const { source, runs } = createRunsSource();
    const { result } = renderHook(() => useEpisodeReanalysis(options(source)));
    act(() => { void result.current.onReanalyze(); });
    act(() => { void result.current.onReanalyze(); });

    act(() => runAt(runs, 0).emit({ animeId: 'anime-1', index: 3, total: 12, episode: 3 }));
    await act(async () => runAt(runs, 0).settle(REVIEW));
    expect(result.current.analysis).toEqual({ isRunning: true });
    expect(result.current.review).toBeUndefined();
    await act(async () => runAt(runs, 1).settle(REVIEW));

    expect(result.current.analysis).toEqual({ isRunning: false });
    expect(result.current.review?.confirmLabel).toBe('Confirm 1 change');
  });

  it('ignores the failure of a run a newer run replaced', async () => {
    const { source, runs } = createRunsSource();
    const { result } = renderHook(() => useEpisodeReanalysis(options(source)));
    act(() => { void result.current.onReanalyze(); });
    act(() => { void result.current.onReanalyze(); });

    await act(async () => runAt(runs, 0).reject(new Error('stale')));
    expect(result.current.review).toBeUndefined();
    await act(async () => runAt(runs, 1).reject(new Error('disk gone')));

    expect(result.current.review?.description).toBe('disk gone');
  });
});

describe('useEpisodeReanalysis progress', () => {
  it('keeps this anime progress when another anime reports after it', () => {
    const { source, runs } = createRunsSource();
    const { result } = renderHook(() => useEpisodeReanalysis(options(source)));
    act(() => { void result.current.onReanalyze(); });

    act(() => {
      runAt(runs, 0).emit({ animeId: 'anime-1', index: 2, total: 12, episode: 2 });
      runAt(runs, 0).emit({ animeId: 'other', index: 9, total: 9, episode: 9 });
    });

    expect(result.current.analysis.progress).toEqual({ animeId: 'anime-1', index: 2, total: 12, episode: 2 });
  });
});

describe('useEpisodeReanalysis cancel on leave', () => {
  it('cancels nothing when it unmounts with no run going', async () => {
    const { source, runs } = createRunsSource();
    const idle = renderHook(() => useEpisodeReanalysis(options(source)));
    idle.unmount();
    const finished = renderHook(() => useEpisodeReanalysis(options(source)));
    act(() => { void finished.result.current.onReanalyze(); });
    await act(async () => runAt(runs, 0).settle(REVIEW));

    finished.unmount();

    expect(source.cancelEpisodeReanalysis).not.toHaveBeenCalled();
  });

  it('cancels a run once, even when the Editor moves on and then closes', () => {
    const { source } = createRunsSource();
    const { result, rerender, unmount } = renderHook((props: UseEpisodeReanalysisOptions) => useEpisodeReanalysis(props), { initialProps: options(source) });
    act(() => { void result.current.onReanalyze(); });

    rerender(options(source, { request: { ...REQUEST, animeId: 'anime-2' } }));
    unmount();

    expect(source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
  });
});

describe('useEpisodeReanalysis with a changing draft', () => {
  it('re-analyzes the draft as it is now, and cancels through the current source', () => {
    const first = createRunsSource();
    const second = createRunsSource();
    const { result, rerender } = renderHook((props: UseEpisodeReanalysisOptions) => useEpisodeReanalysis(props), { initialProps: options(first.source) });
    const moved = { ...REQUEST, folder: 'D:/Anime/Moved' };

    rerender(options(second.source, { request: moved }));
    act(() => { void result.current.onReanalyze(); });
    act(() => result.current.onCancelAnalysis());

    expect(second.source.reanalyzeEpisodeDurations).toHaveBeenCalledWith(moved);
    expect(second.source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
    expect(first.source.cancelEpisodeReanalysis).not.toHaveBeenCalled();
  });

  it('confirms nothing while no review is open', () => {
    const { source } = createRunsSource();
    const onEditsChange = vi.fn();
    const { result } = renderHook(() => useEpisodeReanalysis(options(source, { onEditsChange })));

    act(() => result.current.onConfirmReview());

    expect(onEditsChange).not.toHaveBeenCalled();
  });
});
