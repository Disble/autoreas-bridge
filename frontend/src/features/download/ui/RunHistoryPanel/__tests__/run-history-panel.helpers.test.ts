import { describe, expect, it } from 'vitest';
import { findRunningRunId, readRequestedRunId, toRunHistoryPanelViewModel } from '../run-history-panel.helpers';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';

/** Local noon of 2026-10-23, the "now" the day labels are read against. */
const NOW_MS = new Date(2026, 9, 23, 12, 0).getTime();

/**
 * Builds a run whose every counter is derived from its index, so a list of them is varied
 * without any single value being meaningful. Used where the test cares about ordering or
 * volume rather than about what a particular run contains.
 *
 * @param index Position of the run in the generated list.
 * @param overrides Fields a case pins.
 * @returns A run view with distinct, reproducible values.
 */
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
    skippedCount: 0,
    upToDateCount: 0,
    jdAvailable: true,
    status: 'ok',
    ...overrides,
  };
}

/** A run that finished cleanly this morning, after 2 min 28 s. */
const okRun: DownloadRunView = {
  runId: 'run-1',
  startedAtMs: new Date(2026, 9, 23, 9, 5, 0).getTime(),
  finishedAtMs: new Date(2026, 9, 23, 9, 7, 28).getTime(),
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

/** A run that ended yesterday with JDownloader offline, so links await the user. */
const jdOfflineRun: DownloadRunView = {
  runId: 'run-2',
  startedAtMs: new Date(2026, 9, 22, 22, 0, 0).getTime(),
  finishedAtMs: new Date(2026, 9, 22, 22, 0, 9).getTime(),
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

  it('returns the "ready" status with one labelled row per run', () => {
    const viewModel = toRunHistoryPanelViewModel([okRun, jdOfflineRun], undefined, 20, false, NOW_MS);

    expect(viewModel.status).toBe('ready');
    expect(viewModel.visibleDays.flatMap((day) => day.rows)).toHaveLength(2);
    expect(viewModel.rows[0]).toMatchObject({ runId: 'run-1', trigger: 'manual', durationLabel: '2 min 28 s', episodesDownloaded: 3, episodesFailed: 0 });
    expect(viewModel.rows[0]?.triggerPresentation.label).toBe('Manual check');
    expect(viewModel.rows[0]?.status).toBeUndefined();
    expect(viewModel.rows[0]?.timeLabel).toBe(new Date(okRun.startedAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    expect(viewModel.rows[1]).toMatchObject({ durationLabel: '9 s', status: { label: 'JDownloader offline', tone: 'warning' } });
  });

  it('shows an unknown trigger or status as its raw value', () => {
    const [row] = toRunHistoryPanelViewModel([createRun(1, { trigger: 'webhook', status: 'odd' })], undefined, 20).rows;

    expect(row?.triggerPresentation.label).toBe('webhook');
    expect(row?.status).toMatchObject({ label: 'odd', tone: 'default' });
  });

  // An interrupted run's finishedAt is the next app start, not the end of the work.
  it.each([
    ['interrupted', 1_700_000_100_000],
    ['running', undefined],
  ])('gives a %s run no duration', (status, finishedAtMs) => {
    const [row] = toRunHistoryPanelViewModel([createRun(1, { status, finishedAtMs })], undefined, 20).rows;

    expect(row?.durationLabel).toBeUndefined();
  });

  it.each([
    [9_000, '9 s'],
    [148_000, '2 min 28 s'],
    [3_900_000, '1 h 05 min'],
  ])('formats a %d ms run as "%s"', (elapsedMs, label) => {
    const [row] = toRunHistoryPanelViewModel([createRun(1, { startedAtMs: 0, finishedAtMs: elapsedMs })], undefined, 20).rows;

    expect(row?.durationLabel).toBe(label);
  });

  it('puts the visible rows under Today, Yesterday and dated day headers', () => {
    const older = createRun(3, { startedAtMs: new Date(2026, 9, 20, 8, 0).getTime() });
    const viewModel = toRunHistoryPanelViewModel([okRun, jdOfflineRun, older], undefined, 20, false, NOW_MS);

    expect(viewModel.visibleDays.map((day) => [day.label, day.rows.map((row) => row.runId)])).toEqual([
      ['Today', ['run-1']],
      ['Yesterday', ['run-2']],
      [new Date(older.startedAtMs).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), ['run-3']],
    ]);
  });

  it('counts the problem runs and, when filtered, lists and selects only them', () => {
    const runs = [okRun, jdOfflineRun, createRun(3, { status: 'partial' }), createRun(4, { status: 'canceled' }), createRun(5, { status: 'interrupted' }), createRun(6, { status: 'error' })];

    expect(toRunHistoryPanelViewModel(runs, 'run-1', 20).problemCount).toBe(4);
    const filtered = toRunHistoryPanelViewModel(runs, 'run-1', 20, true);
    expect(filtered.rows.map((row) => row.runId)).toEqual(['run-2', 'run-3', 'run-5', 'run-6']);
    expect(filtered.problemsOnly).toBe(true);
    expect(filtered.problemCount).toBe(4);
    expect(filtered.selectedRun?.runId).toBe('run-2');
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

  it('caps the initial visible rows at 20 and keeps the rest listed', () => {
    const runs = Array.from({ length: 25 }, (_, index) => createRun(index + 1));
    const viewModel = toRunHistoryPanelViewModel(runs, undefined, 20);

    expect(viewModel.visibleDays.flatMap((day) => day.rows)).toHaveLength(20);
    expect(viewModel.rows).toHaveLength(25);
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
