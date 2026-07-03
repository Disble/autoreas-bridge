import { describe, expect, it } from 'vitest';
import { toRunHistoryPanelViewModel } from '../run-history-panel.helpers';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';

const okRun: DownloadRunView = {
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
  skippedCount: 0,
  upToDateCount: 0,
  jdAvailable: false,
  status: 'jd_offline',
  errorSummary: 'JDownloader is offline',
  manualLinks: [{ anime: 'Frieren', episode: 12, links: ['https://example.com/a'] }],
};

describe('toRunHistoryPanelViewModel', () => {
  it('returns the "empty" status with no rows when there are no runs', () => {
    const viewModel = toRunHistoryPanelViewModel([], undefined);

    expect(viewModel.status).toBe('empty');
    expect(viewModel.rows).toEqual([]);
  });

  it('returns the "ready" status with one row per run, formatted', () => {
    const viewModel = toRunHistoryPanelViewModel([okRun, jdOfflineRun], undefined);

    expect(viewModel.status).toBe('ready');
    expect(viewModel.rows).toHaveLength(2);
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
    const viewModel = toRunHistoryPanelViewModel([okRun, jdOfflineRun], 'run-2');

    expect(viewModel.selectedRun?.runId).toBe('run-2');
    expect(viewModel.selectedRun?.manualLinks).toEqual(jdOfflineRun.manualLinks);
  });

  it('leaves selectedRun undefined when selectedRunId does not match any run', () => {
    const viewModel = toRunHistoryPanelViewModel([okRun], 'missing-id');

    expect(viewModel.selectedRun).toBeUndefined();
  });
});
