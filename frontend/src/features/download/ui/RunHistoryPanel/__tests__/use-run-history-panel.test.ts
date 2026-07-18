import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRunHistoryPanel } from '../use-run-history-panel';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';
import { resetDownloadRuntimeStore } from '../../../../../shared/store/download-runtime-store';

function createRun(index: number, overrides: Partial<DownloadRunView> = {}): DownloadRunView {
  return {
    runId: `run-${index}`,
    startedAtMs: 1_700_000_000_000 + index,
    finishedAtMs: 1_700_000_100_000 + index,
    trigger: index % 2 === 0 ? 'manual' : 'scheduled',
    animesChecked: index,
    episodesFound: index % 3,
    episodesDownloaded: index % 4,
    episodesFailed: index % 2,
    skippedCount: index % 5,
    upToDateCount: index % 6,
    jdAvailable: true,
    status: 'ok',
    ...overrides,
  };
}

const runs: readonly DownloadRunView[] = [
  createRun(2, {
    trigger: 'scheduled',
    jdAvailable: false,
    status: 'jd_offline',
    manualLinks: [{ anime: 'Frieren', episode: 12, links: ['https://example.com/a'] }],
  }),
  createRun(1),
];

const manyRuns = Array.from({ length: 25 }, (_, index) => createRun(25 - index));

function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    listDownloadRuns: vi.fn().mockResolvedValue(runs),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useRunHistoryPanel', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
  });

  it('starts in the loading status', () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source));

    expect(result.current.viewModel.status).toBe('loading');
  });

  it('loads runs and exposes them as rows', async () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    expect(result.current.viewModel.rows).toHaveLength(2);
    expect(result.current.viewModel.visibleRows).toHaveLength(2);
    expect(result.current.viewModel.selectedRun?.runId).toBe('run-2');
  });

  it('surfaces the "empty" status when there are no runs', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.status).toBe('empty'));
  });

  it('surfaces an error status when listDownloadRuns rejects', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.status).toBe('error'));
  });

  it('selectRun resolves the selected run by id in the view model', async () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    act(() => {
      result.current.selectRun('run-1');
    });

    expect(result.current.viewModel.selectedRun?.runId).toBe('run-1');
  });

  it('shows only the newest 20 runs at first and exposes load more for older history', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns) });
    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    expect(result.current.viewModel.rows).toHaveLength(25);
    expect(result.current.viewModel.visibleRows).toHaveLength(20);
    expect(result.current.viewModel.canLoadMore).toBe(true);
    expect(result.current.viewModel.remainingCount).toBe(5);
    expect(result.current.viewModel.selectedRun?.runId).toBe(manyRuns[0]?.runId);
  });

  it('loadMore reveals older runs while preserving the current selection', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns) });
    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    act(() => {
      result.current.selectRun(manyRuns[19]!.runId);
    });

    act(() => {
      result.current.loadMore();
    });

    expect(result.current.viewModel.visibleRows).toHaveLength(25);
    expect(result.current.viewModel.canLoadMore).toBe(false);
    expect(result.current.viewModel.selectedRun?.runId).toBe(manyRuns[19]!.runId);
  });

  it('does not expose load more when fewer than 20 runs exist', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns.slice(0, 12)) });
    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    expect(result.current.viewModel.visibleRows).toHaveLength(12);
    expect(result.current.viewModel.canLoadMore).toBe(false);
    expect(result.current.viewModel.remainingCount).toBe(0);
  });

  it('reloads runs when a download run lifecycle event invalidates the store', async () => {
    let listener: (() => void) | undefined;
    const firstRuns = manyRuns;
    const newestRun = createRun(26);
    const secondRuns = [newestRun, ...manyRuns] as const;
    const listDownloadRuns = vi.fn().mockResolvedValueOnce(firstRuns).mockResolvedValueOnce(secondRuns);
    const unsubscribe = vi.fn();
    const subscribeRunEvents = vi.fn().mockImplementation((nextListener: () => void) => {
      listener = nextListener;
      return unsubscribe;
    });
    const source = createSource({ listDownloadRuns, subscribeRunEvents });

    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.rows).toHaveLength(25));

    act(() => {
      result.current.selectRun(firstRuns[19]!.runId);
    });

    await act(async () => {
      listener?.();
    });

    await waitFor(() => expect(result.current.viewModel.rows).toHaveLength(26));
    expect(listDownloadRuns).toHaveBeenCalledTimes(2);
    expect(result.current.viewModel.visibleRows[0]?.runId).toBe(newestRun.runId);
    expect(new Set(result.current.viewModel.visibleRows.map((row) => row.runId)).size).toBe(
      result.current.viewModel.visibleRows.length,
    );
    expect(result.current.viewModel.selectedRun?.runId).toBe(firstRuns[19]!.runId);

    resetDownloadRuntimeStore();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
