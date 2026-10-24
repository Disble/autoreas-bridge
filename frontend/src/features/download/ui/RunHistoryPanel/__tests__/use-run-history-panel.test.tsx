import { act, renderHook, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import type { UIEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRunHistoryPanel } from '../use-run-history-panel';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';
import { getDownloadRuntimeStoreState, resetDownloadRuntimeStore } from '../../../../../shared/store/download-runtime-store/download-runtime-store.helpers';
import type { RunHistoryStory, RunHistoryStorySource } from '../run-history-panel.types';
import { atRoute } from './run-history-router';

/** Builds one run history row, numbered so ordering assertions read plainly. */
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
    episodesDownloading: Math.max(0, (index % 3) - (index % 4) - (index % 2)),
    skippedCount: index % 5,
    upToDateCount: index % 6,
    jdAvailable: true,
    status: 'ok',
    ...overrides,
  };
}

/** Small run history the stubbed port returns unless a case overrides it. */
const runs: readonly DownloadRunView[] = [
  createRun(2, {
    trigger: 'scheduled',
    jdAvailable: false,
    status: 'jd_offline',
    manualLinks: [{ anime: 'Frieren', episode: 12, links: ['https://example.com/a'] }],
  }),
  createRun(1),
];

/** Newest-first history long enough to exercise the progressive list window. */
const manyRuns = Array.from({ length: 25 }, (_, index) => createRun(25 - index));

/** Builds a fully stubbed download runtime port, overridable per case. */
function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn().mockResolvedValue('ok'),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn().mockResolvedValue(runs),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    subscribeMissedScheduleSettled: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useRunHistoryPanel', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
  });

  it('starts in the loading status', () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    expect(result.current.viewModel.status).toBe('loading');
  });

  it('loads runs and exposes them as rows', async () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    expect(result.current.viewModel.rows).toHaveLength(2);
    expect(result.current.viewModel.visibleRows).toHaveLength(2);
    expect(result.current.viewModel.selectedRun?.runId).toBe('run-2');
  });

  it('surfaces the "empty" status when there are no runs', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('empty'));
  });

  it('surfaces an error status when listDownloadRuns rejects', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('error'));
  });

  it('selectRun resolves the selected run by id in the view model', async () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    act(() => {
      result.current.selectRun('run-1');
    });

    expect(result.current.viewModel.selectedRun?.runId).toBe('run-1');
  });

  it('shows only the newest 20 runs at first and exposes load more for older history', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    expect(result.current.viewModel.rows).toHaveLength(25);
    expect(result.current.viewModel.visibleRows).toHaveLength(20);
    expect(result.current.viewModel.canLoadMore).toBe(true);
    expect(result.current.viewModel.remainingCount).toBe(5);
    expect(result.current.viewModel.selectedRun?.runId).toBe(manyRuns[0]?.runId);
  });

  it('loadMore reveals older runs while preserving the current selection', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

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

  it('opens a manual link in the default browser through the Wails runtime, never in the WebView', async () => {
    const browserOpenURL = vi.fn();
    const runtime = window.runtime;
    window.runtime = { ...runtime, BrowserOpenURL: browserOpenURL };
    const { result, unmount } = renderHook(() => useRunHistoryPanel(createSource()), { wrapper: atRoute() });
    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    act(() => result.current.openLink('https://mega.nz/file/a'));

    expect(browserOpenURL).toHaveBeenCalledExactlyOnceWith('https://mega.nz/file/a');
    unmount();
    window.runtime = runtime;
  });

  it('reveals older runs when the rail is scrolled near its bottom', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));
    expect(result.current.viewModel.visibleRows).toHaveLength(20);

    act(() => {
      result.current.onScroll({
        currentTarget: { scrollTop: 900, clientHeight: 400, scrollHeight: 1400 },
      } as unknown as UIEvent<HTMLDivElement>);
    });

    expect(result.current.viewModel.visibleRows).toHaveLength(25);
  });

  it('ignores a scroll that is still far from the bottom', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    act(() => {
      result.current.onScroll({
        currentTarget: { scrollTop: 0, clientHeight: 400, scrollHeight: 5000 },
      } as unknown as UIEvent<HTMLDivElement>);
    });

    expect(result.current.viewModel.visibleRows).toHaveLength(20);
  });

  it('does not expose load more when fewer than 20 runs exist', async () => {
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(manyRuns.slice(0, 12)) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

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

    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

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

describe('useRunHistoryPanel stop control', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
    vi.restoreAllMocks();
  });

  it('exposes no stop control when every run has finished', async () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));
    expect(result.current.viewModel.runInProgress).toBe(false);
  });

  it('exposes the stop control while a run is in flight', async () => {
    const source = createSource({
      listDownloadRuns: vi.fn().mockResolvedValue([createRun(3, { status: 'running' }), ...runs]),
    });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.runInProgress).toBe(true));
  });

  it('asks the backend to stop the in-flight run', async () => {
    const cancelDownloadRun = vi.fn().mockResolvedValue('ok');
    const source = createSource({
      listDownloadRuns: vi.fn().mockResolvedValue([createRun(3, { status: 'running' }), ...runs]),
      cancelDownloadRun,
    });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.runInProgress).toBe(true));
    await act(async () => {
      await result.current.cancelRun();
    });

    expect(cancelDownloadRun).toHaveBeenCalledTimes(1);
  });

  it('surfaces the backend message when the run could not be stopped', async () => {
    const source = createSource({
      listDownloadRuns: vi.fn().mockResolvedValue([createRun(3, { status: 'running' }), ...runs]),
      cancelDownloadRun: vi.fn().mockResolvedValue('no download run in progress'),
    });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.runInProgress).toBe(true));
    await act(async () => {
      await result.current.cancelRun();
    });

    await waitFor(() => expect(result.current.viewModel.errorMessage).toBe('no download run in progress'));
  });
});

describe('useRunHistoryPanel stopping feedback', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
    vi.restoreAllMocks();
  });

  // Stopping is not instant: the backend cancels the run context and the pipeline
  // stops at its next boundary. Without a pending state the button looks inert and
  // the user cannot tell the press registered at all.
  it('reports the stop as pending from the press until the run actually ends', async () => {
    const runningRuns = [createRun(3, { runId: 'run-live', status: 'running' }), ...runs];
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue(runningRuns) });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.runInProgress).toBe(true));
    expect(result.current.viewModel.isStopping).toBe(false);

    await act(async () => {
      await result.current.cancelRun();
    });

    expect(result.current.viewModel.isStopping).toBe(true);
  });

  it('clears the pending state once the stopped run reaches a terminal status', async () => {
    let listener: (() => void) | undefined;
    const listDownloadRuns = vi
      .fn()
      .mockResolvedValueOnce([createRun(3, { runId: 'run-live', status: 'running' }), ...runs])
      .mockResolvedValueOnce([createRun(3, { runId: 'run-live', status: 'canceled' }), ...runs]);
    const source = createSource({
      listDownloadRuns,
      subscribeRunEvents: vi.fn().mockImplementation((nextListener: () => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.runInProgress).toBe(true));
    await act(async () => {
      await result.current.cancelRun();
    });
    expect(result.current.viewModel.isStopping).toBe(true);

    // The run finalizing its own terminal row is what ends the pending state.
    await act(async () => {
      listener?.();
    });

    await waitFor(() => expect(result.current.viewModel.runInProgress).toBe(false));
    expect(result.current.viewModel.isStopping).toBe(false);
  });

  // A refused stop must not leave the button stuck saying "Stopping…" forever.
  it('clears the pending state when the backend refuses the stop', async () => {
    const source = createSource({
      listDownloadRuns: vi.fn().mockResolvedValue([createRun(3, { runId: 'run-live', status: 'running' }), ...runs]),
      cancelDownloadRun: vi.fn().mockResolvedValue('no download run in progress'),
    });
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.runInProgress).toBe(true));
    await act(async () => {
      await result.current.cancelRun();
    });

    expect(result.current.viewModel.isStopping).toBe(false);
    expect(result.current.viewModel.errorMessage).toBe('no download run in progress');
  });

  // The whole point of the run parameter: a notification's "See this run" verb
  // is a route change, and it must land on the run it names rather than on the
  // newest one. Before this, the correlation id was a token printed in the
  // notification pane that nobody could act on.
  it('selects the run the route asked for', async () => {
    const source = createSource();

    renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute('?runId=run-2') });

    await waitFor(() => {
      expect(getDownloadRuntimeStoreState().selectedRunId).toBe('run-2');
    });
  });

  // No parameter must leave the panel's own default alone rather than clearing
  // whatever the user had selected.
  it('leaves the selection alone when the route names no run', async () => {
    const source = createSource();
    getDownloadRuntimeStoreState().selectRun('run-1');

    renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });

    await waitFor(() => {
      expect(getDownloadRuntimeStoreState().selectedRunId).toBe('run-1');
    });
  });
});

describe('useRunHistoryPanel run story', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
  });

  /** One stored story: Frieren downloaded episode 4. */
  const story: RunHistoryStory = {
    truncated: false,
    steps: [{ entityId: 'a1', eventType: 'download.episode_downloaded', level: 'info', metadataJson: '{"animeName":"Frieren","episode":4}' }],
  };

  /** A story port answering `story`, spied. */
  function createStorySource(): RunHistoryStorySource & { readonly getRunStory: ReturnType<typeof vi.fn> } {
    return { getRunStory: vi.fn().mockResolvedValue(story) };
  }

  /** A cover port answering one cover per anime. */
  const coverSource = { getAnimeCover: vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/png;base64,AA' }) };

  it('builds the selected run detail from its story and resolves the covers of its anime', async () => {
    const storySource = createStorySource();
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue([createRun(1, { episodesFound: 1, episodesDownloaded: 1, episodesFailed: 0, episodesDownloading: 0 })]) });
    const { result } = renderHook(() => useRunHistoryPanel(source, { storySource, coverSource }), { wrapper: atRoute() });

    await waitFor(() => expect(result.current.viewModel.detail?.groups.find((group) => group.id === 'downloaded')?.rows).toHaveLength(1));

    expect(storySource.getRunStory).toHaveBeenCalledWith('run-1');
    expect(result.current.viewModel.detail?.groups.find((group) => group.id === 'downloaded')?.rows?.[0]).toMatchObject({ name: 'Frieren', values: ['Episode 4'] });
    await waitFor(() => expect(result.current.viewModel.covers.get('a1')).toEqual({ status: 'cover', dataUrl: 'data:image/png;base64,AA' }));
  });

  it('names an anime the story left unnamed from the catalog, and keeps its id when the catalog has none', async () => {
    const unnamed: RunHistoryStory = {
      truncated: false,
      steps: [
        { entityId: 'a1', eventType: 'download.episode_downloaded', level: 'info', metadataJson: '{"episode":4}' },
        { entityId: 'a2', eventType: 'download.episode_downloaded', level: 'info', metadataJson: '{"episode":5}' },
      ],
    };
    const storySource = { getRunStory: vi.fn().mockResolvedValue(unnamed) };
    const nameSource = { getAnimeDetail: vi.fn().mockImplementation((id: string) => (id === 'a1' ? Promise.resolve({ name: 'Frieren' }) : Promise.resolve(null))) };
    const source = createSource({ listDownloadRuns: vi.fn().mockResolvedValue([createRun(1, { episodesFound: 2, episodesDownloaded: 2, episodesFailed: 0, episodesDownloading: 0 })]) });
    const { result } = renderHook(() => useRunHistoryPanel(source, { storySource, coverSource, nameSource }), { wrapper: atRoute() });
    const rows = () => result.current.viewModel.detail?.groups.find((group) => group.id === 'downloaded')?.rows?.map(({ name, isNameLoading }) => ({ name, isNameLoading }));

    await waitFor(() => expect(rows()).toEqual([{ name: 'Frieren', isNameLoading: false }, { name: 'a2', isNameLoading: false }]));
    expect(nameSource.getAnimeDetail.mock.calls).toEqual([['a1'], ['a2']]);
  });

  it('reads a live run story again on each download event, and a finished run only once', async () => {
    let listener: (() => void) | undefined;
    const subscribeRunEvents = vi.fn().mockImplementation((next: () => void) => {
      listener = next;
      return () => undefined;
    });
    const running = createRun(1, { status: 'running', finishedAtMs: undefined });
    const listDownloadRuns = vi.fn().mockResolvedValueOnce([running]).mockResolvedValueOnce([{ ...running, episodesDownloaded: 2 }]).mockResolvedValue([{ ...running, status: 'ok' }]);
    const storySource = createStorySource();
    const source = createSource({ listDownloadRuns, subscribeRunEvents });
    renderHook(() => useRunHistoryPanel(source, { storySource, coverSource }), { wrapper: atRoute() });

    await waitFor(() => expect(storySource.getRunStory).toHaveBeenCalledTimes(1));
    await act(async () => {
      listener?.();
    });
    await waitFor(() => expect(storySource.getRunStory).toHaveBeenCalledTimes(2));
    await act(async () => {
      listener?.();
    });
    await waitFor(() => expect(storySource.getRunStory).toHaveBeenCalledTimes(3));
    await act(async () => {
      listener?.();
    });
    await waitFor(() => expect(listDownloadRuns).toHaveBeenCalledTimes(4));
    expect(storySource.getRunStory).toHaveBeenCalledTimes(3);
  });

  it('toggles the Problems filter', async () => {
    const source = createSource();
    const { result } = renderHook(() => useRunHistoryPanel(source), { wrapper: atRoute() });
    await waitFor(() => expect(result.current.viewModel.status).toBe('ready'));

    act(() => {
      result.current.toggleProblems();
    });

    expect(result.current.viewModel.problemsOnly).toBe(true);
    expect(result.current.viewModel.rows.map((row) => row.runId)).toEqual(['run-2']);
  });

  it('opens an anime in the editor', async () => {
    const source = createSource();
    const { result } = renderHook(() => ({ panel: useRunHistoryPanel(source), location: useLocation() }), { wrapper: atRoute() });

    act(() => {
      result.current.panel.editAnime('a7');
    });

    await waitFor(() => expect(result.current.location.pathname).toBe('/editor/a7'));
  });
});
