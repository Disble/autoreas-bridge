import type { DownloadRunView } from '../../../../shared/contracts/download.types';
import { RUN_HISTORY_PAGE_SIZE } from './run-history-panel.constants';
import type { RunHistoryPanelViewModel, RunHistoryRowViewModel } from './run-history-panel.types';

/**
 * Maps the raw `DownloadRunView[]` (Wails wire shape, newest-first per
 * `ListDownloadRuns`) into the master/detail view model: one formatted row
 * per run, plus the currently selected run's full record (manual links
 * included) resolved by `selectedRunId`.
 */
export function toRunHistoryPanelViewModel(
  runs: readonly DownloadRunView[],
  selectedRunId: string | undefined,
  visibleCount: number,
): RunHistoryPanelViewModel {
  if (runs.length === 0) {
    return {
      status: 'empty',
      rows: [],
      visibleRows: [],
      canLoadMore: false,
      remainingCount: 0,
      runInProgress: false,
      isStopping: false,
    };
  }

  const effectiveSelectedRunId = resolveSelectedRunId(runs, selectedRunId);

  const rows: readonly RunHistoryRowViewModel[] = runs.map((run) => ({
    runId: run.runId,
    isSelected: run.runId === effectiveSelectedRunId,
    startedLabel: new Date(run.startedAtMs).toLocaleString(),
    statusLabel: run.status,
    trigger: run.trigger,
    episodesDownloaded: run.episodesDownloaded,
    episodesFailed: run.episodesFailed,
  }));

  const selectedRun = runs.find((run) => run.runId === effectiveSelectedRunId);
  const safeVisibleCount = Math.max(getInitialVisibleRunCount(runs.length), visibleCount);
  const visibleRows = rows.slice(0, Math.min(safeVisibleCount, rows.length));
  const runningRunId = findRunningRunId(runs);

  return {
    status: 'ready',
    rows,
    visibleRows,
    canLoadMore: visibleRows.length < rows.length,
    remainingCount: rows.length - visibleRows.length,
    runInProgress: runningRunId !== undefined,
    runningRunId,
    isStopping: false,
    selectedRun,
  };
}

/**
 * Returns the id of the run currently in flight, or undefined when none is. Both
 * entry points -- the scheduler's full check and the App's single-anime catch-up --
 * open their row as "running" and replace it with a terminal status when they end,
 * so the run history is the one signal that sees every kind of run without a second
 * liveness query.
 *
 * This returns the ID rather than a boolean so a pending "Stopping…" state can be
 * tied to the exact run it was requested for. That state then clears itself when
 * that run reaches a terminal status, with no timer and no flag to reset.
 */
export function findRunningRunId(runs: readonly DownloadRunView[]): string | undefined {
  return runs.find((run) => run.status === 'running')?.runId;
}

/** Resolves which run should be selected, defaulting to the newest available item. */
function resolveSelectedRunId(
  runs: readonly DownloadRunView[],
  selectedRunId: string | undefined,
): string | undefined {
  if (selectedRunId !== undefined && runs.some((run) => run.runId === selectedRunId)) {
    return selectedRunId;
  }

  return runs[0]?.runId;
}

/** Returns the bounded initial list size for the current history snapshot. */
function getInitialVisibleRunCount(totalRuns: number): number {
  return Math.min(totalRuns, RUN_HISTORY_PAGE_SIZE);
}

/** Returns the next window size after the user asks to reveal older history. */
export function getNextVisibleRunCount(currentVisibleCount: number, totalRuns: number): number {
  return Math.min(totalRuns, currentVisibleCount + RUN_HISTORY_PAGE_SIZE);
}

/**
 * Keeps the visible window stable across refreshes while ensuring the current
 * selection remains rendered and a fully revealed list stays fully revealed.
 */
export function reconcileVisibleRunCount(
  currentVisibleCount: number,
  previousTotalRuns: number,
  nextRuns: readonly DownloadRunView[],
  selectedRunId: string | undefined,
): number {
  if (nextRuns.length === 0) {
    return RUN_HISTORY_PAGE_SIZE;
  }

  let nextVisibleCount = Math.max(getInitialVisibleRunCount(nextRuns.length), Math.min(currentVisibleCount, nextRuns.length));

  if (previousTotalRuns > 0 && currentVisibleCount >= previousTotalRuns) {
    nextVisibleCount = nextRuns.length;
  }

  if (selectedRunId !== undefined) {
    const selectedIndex = nextRuns.findIndex((run) => run.runId === selectedRunId);

    if (selectedIndex >= 0) {
      nextVisibleCount = Math.max(nextVisibleCount, selectedIndex + 1);
    }
  }

  return Math.min(nextVisibleCount, nextRuns.length);
}
