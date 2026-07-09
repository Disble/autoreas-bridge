import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRunHistoryPanel } from '../use-run-history-panel';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';
import { resetDownloadRuntimeStore } from '../../../../../shared/store/download-runtime-store';

const runs: readonly DownloadRunView[] = [
  {
    runId: 'run-1',
    startedAtMs: 1_700_000_000_000,
    finishedAtMs: 1_700_000_100_000,
    trigger: 'manual',
    animesChecked: 10,
    episodesFound: 3,
    episodesDownloaded: 3,
    episodesFailed: 0,
    skippedCount: 7,
    upToDateCount: 0,
    jdAvailable: true,
    status: 'ok',
  },
  {
    runId: 'run-2',
    startedAtMs: 1_700_086_400_000,
    finishedAtMs: 1_700_086_500_000,
    trigger: 'scheduled',
    animesChecked: 5,
    episodesFound: 2,
    episodesDownloaded: 0,
    episodesFailed: 0,
    skippedCount: 0,
    upToDateCount: 0,
    jdAvailable: false,
    status: 'jd_offline',
    manualLinks: [{ anime: 'Frieren', episode: 12, links: ['https://example.com/a'] }],
  },
];

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
      result.current.selectRun('run-2');
    });

    expect(result.current.viewModel.selectedRun?.runId).toBe('run-2');
    expect(result.current.viewModel.selectedRun?.manualLinks).toHaveLength(1);
  });

  it('reloads runs when a download run lifecycle event invalidates the store', async () => {
    let listener: (() => void) | undefined;
    const firstRuns = [runs[0]] as const;
    const secondRuns = runs;
    const listDownloadRuns = vi.fn().mockResolvedValueOnce(firstRuns).mockResolvedValueOnce(secondRuns);
    const unsubscribe = vi.fn();
    const subscribeRunEvents = vi.fn().mockImplementation((nextListener: () => void) => {
      listener = nextListener;
      return unsubscribe;
    });
    const source = createSource({ listDownloadRuns, subscribeRunEvents });

    const { result } = renderHook(() => useRunHistoryPanel(source));

    await waitFor(() => expect(result.current.viewModel.rows).toHaveLength(1));

    await act(async () => {
      listener?.();
    });

    await waitFor(() => expect(result.current.viewModel.rows).toHaveLength(2));
    expect(listDownloadRuns).toHaveBeenCalledTimes(2);

    resetDownloadRuntimeStore();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
