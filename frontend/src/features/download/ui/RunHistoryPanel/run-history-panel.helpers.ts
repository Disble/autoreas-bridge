import type { DownloadRunView } from '../../../../shared/contracts/download.types';
import {
  RUN_HISTORY_DAY_MS,
  RUN_HISTORY_PAGE_SIZE,
  RUN_HISTORY_PROBLEM_STATUSES,
  RUN_HISTORY_STATUSES,
  RUN_HISTORY_TRIGGERS,
  RUN_HISTORY_UNKNOWN_STATUS_ICON,
  RUN_HISTORY_UNKNOWN_TRIGGER_ICON,
} from './run-history-panel.constants';
import type {
  RunHistoryDayGroupViewModel,
  RunHistoryPanelViewModel,
  RunHistoryPresentation,
  RunHistoryRowViewModel,
} from './run-history-panel.types';

/**
 * Maps the raw `DownloadRunView[]` (Wails wire shape, newest-first per
 * `ListDownloadRuns`) into the master/detail view model: one labelled row
 * per run under its day header, the Problems filter's count, and the
 * currently selected run's full record resolved by `selectedRunId`. With the
 * filter on, only problem runs are listed and the selection falls back to
 * the newest of them.
 *
 * @param runs The loaded history.
 * @param selectedRunId The run the user or route selected.
 * @param visibleCount How many rows the progressive window shows.
 * @param problemsOnly Whether the Problems filter is on.
 * @param nowMs The current time, for the day labels.
 * @returns The list view model; the hook adds the detail and covers.
 */
export function toRunHistoryPanelViewModel(
  runs: readonly DownloadRunView[],
  selectedRunId: string | undefined,
  visibleCount: number,
  problemsOnly = false,
  nowMs: number = Date.now(),
): RunHistoryPanelViewModel {
  const problemCount = runs.filter(isProblemRun).length;
  const base = { problemCount, problemsOnly, isStopping: false, covers: new Map() };

  if (runs.length === 0) {
    return { ...base, status: 'empty', rows: [], visibleDays: [], runInProgress: false };
  }

  const listedRuns = problemsOnly ? runs.filter(isProblemRun) : runs;
  const effectiveSelectedRunId = resolveSelectedRunId(listedRuns, selectedRunId);
  const rows = listedRuns.map((run) => toRunRow(run, run.runId === effectiveSelectedRunId, nowMs));
  const safeVisibleCount = Math.max(getInitialVisibleRunCount(rows.length), visibleCount);
  const visibleRows = rows.slice(0, Math.min(safeVisibleCount, rows.length));
  const runningRunId = findRunningRunId(runs);

  return {
    ...base,
    status: 'ready',
    rows,
    visibleDays: groupRowsByDay(visibleRows),
    runInProgress: runningRunId !== undefined,
    runningRunId,
    selectedRun: listedRuns.find((run) => run.runId === effectiveSelectedRunId),
  };
}

/**
 * Lays the load outcome over the panel's view model: a failed history read is
 * the error state, an unread one is still loading, and a refused stop keeps
 * the history that loaded fine and only adds its message.
 *
 * @param viewModel The view model built from the loaded history.
 * @param load What the history read and the last stop request reported.
 * @returns The view model with its final status and message.
 */
export function withLoadOutcome(
  viewModel: RunHistoryPanelViewModel,
  load: { readonly hasLoaded: boolean; readonly errorMessage?: string; readonly cancelErrorMessage?: string },
): RunHistoryPanelViewModel {
  if (load.errorMessage !== undefined) {
    return { ...viewModel, status: 'error', errorMessage: load.errorMessage };
  }

  if (!load.hasLoaded) {
    return { ...viewModel, status: 'loading' };
  }

  return load.cancelErrorMessage === undefined ? viewModel : { ...viewModel, errorMessage: load.cancelErrorMessage };
}

/**
 * Looks up a status's fixed label, icon and tone. `ok` has none; a status the
 * map does not know shows its raw value with a muted question mark.
 *
 * @param status The run's raw status.
 * @returns The presentation, or undefined for `ok`.
 */
export function toRunStatusPresentation(status: string): RunHistoryPresentation | undefined {
  if (!(status in RUN_HISTORY_STATUSES)) {
    return { label: status, icon: RUN_HISTORY_UNKNOWN_STATUS_ICON, tone: 'default' };
  }

  return RUN_HISTORY_STATUSES[status] ?? undefined;
}

/** True for a status the Problems filter keeps. */
function isProblemRun(run: DownloadRunView): boolean {
  return RUN_HISTORY_PROBLEM_STATUSES.has(run.status);
}

/** Builds one master-list row. */
function toRunRow(run: DownloadRunView, isSelected: boolean, nowMs: number): RunHistoryRowViewModel {
  const trigger = RUN_HISTORY_TRIGGERS[run.trigger];
  const started = new Date(run.startedAtMs);

  return {
    runId: run.runId,
    isSelected,
    trigger: run.trigger,
    triggerPresentation: { label: trigger?.label ?? run.trigger, icon: trigger?.icon ?? RUN_HISTORY_UNKNOWN_TRIGGER_ICON, tone: 'default' },
    timeLabel: started.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    durationLabel: run.finishedAtMs === undefined || run.status === 'interrupted' || run.status === 'running' ? undefined : formatDuration(run.finishedAtMs - run.startedAtMs),
    dayKey: started.toDateString(),
    dayLabel: formatDayLabel(started, nowMs),
    episodesFound: run.episodesFound,
    episodesDownloaded: run.episodesDownloaded,
    episodesFailed: run.episodesFailed,
    status: toRunStatusPresentation(run.status),
  };
}

/** Formats elapsed time as `9 s`, `2 min 28 s` or `1 h 05 min`. */
function formatDuration(elapsedMs: number): string {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
  }

  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Labels a local day as Today, Yesterday or a short weekday date. */
function formatDayLabel(day: Date, nowMs: number): string {
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOf(day) - startOf(new Date(nowMs))) / RUN_HISTORY_DAY_MS);
  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === -1) {
    return 'Yesterday';
  }

  return day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Splits rows into consecutive same-day groups, keeping their order. */
function groupRowsByDay(rows: readonly RunHistoryRowViewModel[]): RunHistoryDayGroupViewModel[] {
  const days: { key: string; label: string; rows: RunHistoryRowViewModel[] }[] = [];
  for (const row of rows) {
    const last = days.at(-1);
    if (last?.key === row.dayKey) {
      last.rows.push(row);
    } else {
      days.push({ key: row.dayKey, label: row.dayLabel, rows: [row] });
    }
  }

  return days;
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

/**
 * Reads the run a caller asked the route to open, from its query string.
 *
 * A download notification's correlation id IS its run id, so a "See this run"
 * verb can address one run rather than dropping the user on the newest one.
 * That verb is the reason this exists: the correlation id used to be printed in
 * the notification pane as an opaque token nobody could paste anywhere, and it
 * only becomes useful once a route can act on it
 * (docs/notification-cta-policy.md, "Metadata is not content").
 *
 * An absent or empty value reports nothing rather than an empty string: the
 * panel must fall back to its own default selection, and selecting "" would
 * look like a choice while resolving to no run at all.
 */
export function readRequestedRunId(search: string): string | undefined {
  const requested = new URLSearchParams(search).get('runId');
  return requested === null || requested === '' ? undefined : requested;
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
