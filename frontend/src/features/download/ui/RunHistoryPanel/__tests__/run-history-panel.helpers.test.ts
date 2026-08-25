import { describe, expect, it } from 'vitest';
import { findRunningRunId, pendingEpisodesLabel, readRequestedRunId, toRunHistoryPanelViewModel } from '../run-history-panel.helpers';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';

/**
 * Builds a run whose every counter is derived from its index, so a list of them is varied
 * without any single value being meaningful. Used where the test cares about ordering or
 * volume rather than about what a particular run contains.
 *
 * @param index Position of the run in the generated list.
 * @returns A run view with distinct, reproducible values.
 */
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

/** A run that finished cleanly, with seven anime skipped as already up to date. */
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

/** A run that ended with JDownloader offline, so nothing downloaded and links await the user. */
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

describe('pendingEpisodesLabel', () => {
  // The number is `found - downloaded - failed`, which means two different things
  // depending on whether the run is over. While it runs, those episodes really are
  // in flight. Once it has terminated nothing can still be downloading, so the same
  // number means "never attempted" -- and calling that "Downloading" is what made a
  // jd_offline run with 0 downloaded and 0 failed report "8 downloading".
  it('says Downloading only while the run is still open', () => {
    expect(pendingEpisodesLabel(true)).toBe('Downloading');
  });

  it('says Not attempted once the run has terminated', () => {
    expect(pendingEpisodesLabel(false)).toBe('Not attempted');
  });
});

describe('findRunningRunId', () => {
  // A run row is opened as "running" by BOTH entry points -- the scheduler's
  // full check and the App's single-anime catch-up -- so the row itself is the
  // one signal that covers every way a download can be in flight. The ID (not a
  // boolean) is what lets the UI tie a pending "Stopping…" state to the exact run
  // it asked to stop, so the state clears itself when that run ends.
  it('returns the id of the run still running', () => {
    expect(findRunningRunId([{ ...okRun, runId: 'run-live', status: 'running' }, okRun])).toBe('run-live');
  });

  it('returns undefined once every row reached a terminal status', () => {
    expect(findRunningRunId([okRun, jdOfflineRun])).toBeUndefined();
  });

  it('returns undefined for an empty history', () => {
    expect(findRunningRunId([])).toBeUndefined();
  });

  it('does not mistake a canceled run for a running one', () => {
    expect(findRunningRunId([{ ...okRun, status: 'canceled' }])).toBeUndefined();
  });
});

describe('readRequestedRunId', () => {
  // The correlation id on a download notification IS its run id, which is what
  // lets a notification's "See this run" verb address one run rather than
  // dropping the user on the newest (docs/notification-cta-policy.md).
  it('reads the run a caller asked for', () => {
    expect(readRequestedRunId('?runId=run-dkxpla04beok')).toBe('run-dkxpla04beok');
  });

  it('reads it alongside other parameters', () => {
    expect(readRequestedRunId('?tab=downloads&runId=run-7')).toBe('run-7');
  });

  // Absent means "no one asked", which must leave the panel's own default
  // selection alone rather than clearing it.
  it('reports nothing when no run was asked for', () => {
    expect(readRequestedRunId('')).toBeUndefined();
    expect(readRequestedRunId('?tab=downloads')).toBeUndefined();
  });

  // An empty value addresses no run. Selecting "" would look like a selection
  // and resolve to nothing, which is worse than falling back to the newest run.
  it('treats an empty value as nothing asked for', () => {
    expect(readRequestedRunId('?runId=')).toBeUndefined();
  });
});
