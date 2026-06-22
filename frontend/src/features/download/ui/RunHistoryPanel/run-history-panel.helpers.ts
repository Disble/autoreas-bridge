import type { DownloadRunView } from '../../../../shared/contracts/download.types';
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
): RunHistoryPanelViewModel {
  if (runs.length === 0) {
    return { status: 'empty', rows: [] };
  }

  const rows: readonly RunHistoryRowViewModel[] = runs.map((run) => ({
    runId: run.runId,
    startedLabel: new Date(run.startedAtMs).toLocaleString(),
    statusLabel: run.status,
    trigger: run.trigger,
    episodesDownloaded: run.episodesDownloaded,
    episodesFailed: run.episodesFailed,
  }));

  const selectedRun = runs.find((run) => run.runId === selectedRunId);

  return {
    status: 'ready',
    rows,
    selectedRun,
  };
}
