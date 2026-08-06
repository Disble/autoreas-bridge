import { describe, expect, it } from 'vitest';
import { isDownloadRunInProgress, toRunHistoryPanelViewModel } from '../run-history-panel.helpers';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';

function createRun(index: number): DownloadRunView {
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
    skippedCount: 0,
    upToDateCount: 0,
    jdAvailable: true,
    status: 'ok',
  };
}

const okRun: DownloadRunView = {
  runId: 'run-1',
  startedAtMs: 1_700_000_000_000,
  finishedAtMs: 1_700_000_100_000,
  trigger: 'manual',
  animesChecked: 10,
  episodesFound: 3,
  episodesDownloaded: 3,
  episodesFailed: 0,
  episodesDownloading: 0,
  skippedCount: 7,
  upToDateCount: 0,
  jdAvailable: true,
  status: 'ok',
};

const jdOfflineRun: DownloadRunView = {
  runId: 'run-2',
  startedAtMs: 1_700_086_400_000,
  finishedAtMs: 1_700_086_500_000,
  trigger: 'scheduled',
  animesChecked: 5,
  episodesFound: 2,
  episodesDownloaded: 0,
  episodesFailed: 0,
  episodesDownloading: 2,
  skippedCount: 0,
  upToDateCount: 0,
  jdAvailable: false,
  status: 'jd_offline',
  errorSummary: 'JDownloader is offline',
  manualLinks: [{ anime: 'Frieren', episode: 12, links: ['https://example.com/a'] }],
};

describe('toRunHistoryPanelViewModel', () => {
  it('returns the "empty" status with no rows when there are no runs', () => {
    const viewModel = toRunHistoryPanelViewModel([], undefined, 20);

    expect(viewModel.status).toBe('empty');
    expect(viewModel.rows).toEqual([]);
  });

  it('returns the "ready" status with one row per run, formatted', () => {
    const viewModel = toRunHistoryPanelViewModel([okRun, jdOfflineRun], undefined, 20);

    expect(viewModel.status).toBe('ready');
    expect(viewModel.rows).toHaveLength(2);
    expect(viewModel.visibleRows).toHaveLength(2);
    expect(viewModel.canLoadMore).toBe(false);
    expect(viewModel.rows[0]).toMatchObject({
      runId: 'run-1',
      statusLabel: 'ok',
      trigger: 'manual',
      episodesDownloaded: 3,
      episodesFailed: 0,
    });
    expect(viewModel.rows[0]?.startedLabel).toBe(new Date(okRun.startedAtMs).toLocaleString());
  });

  it('resolves selectedRun by matching selectedRunId against the run list', () => {
    const viewModel = toRunHistoryPanelViewModel([okRun, jdOfflineRun], 'run-2', 20);

    expect(viewModel.selectedRun?.runId).toBe('run-2');
    expect(viewModel.selectedRun?.manualLinks).toEqual(jdOfflineRun.manualLinks);
    expect(viewModel.rows[1]?.isSelected).toBe(true);
  });

  it('defaults the selected run to the newest available run when nothing is selected', () => {
    const viewModel = toRunHistoryPanelViewModel([okRun, jdOfflineRun], undefined, 20);

    expect(viewModel.selectedRun?.runId).toBe('run-1');
    expect(viewModel.rows[0]?.isSelected).toBe(true);
  });

  it('falls back to the newest run when the selected id no longer exists', () => {
    const viewModel = toRunHistoryPanelViewModel([okRun], 'missing-id', 20);

    expect(viewModel.selectedRun?.runId).toBe('run-1');
    expect(viewModel.rows[0]?.isSelected).toBe(true);
  });

  it('caps the initial visible rows at 20 and exposes the remaining count', () => {
    const runs = Array.from({ length: 25 }, (_, index) => createRun(index + 1));
    const viewModel = toRunHistoryPanelViewModel(runs, undefined, 20);

    expect(viewModel.visibleRows).toHaveLength(20);
    expect(viewModel.canLoadMore).toBe(true);
    expect(viewModel.remainingCount).toBe(5);
  });
});

describe('isDownloadRunInProgress', () => {
  // A run row is opened as "running" by BOTH entry points -- the scheduler's
  // full check and the App's single-anime catch-up -- so the row itself is the
  // one signal that covers every way a download can be in flight.
  it('reports a run in progress while a row is still running', () => {
    expect(isDownloadRunInProgress([{ ...okRun, status: 'running' }, okRun])).toBe(true);
  });

  it('reports no run in progress once every row reached a terminal status', () => {
    expect(isDownloadRunInProgress([okRun, jdOfflineRun])).toBe(false);
  });

  it('reports no run in progress for an empty history', () => {
    expect(isDownloadRunInProgress([])).toBe(false);
  });

  it('does not mistake a canceled run for a running one', () => {
    expect(isDownloadRunInProgress([{ ...okRun, status: 'canceled' }])).toBe(false);
  });
});
