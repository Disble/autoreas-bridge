import { Chip } from '@heroui/react';
import { pendingEpisodesLabel } from './run-history-panel.helpers';
import type { RunHistoryDetailPaneProps } from './run-history-panel.types';
import { RunHistoryManualLinks } from './RunHistoryManualLinks';
import { RunProgressBar } from './RunProgressBar';

/**
 * Renders the master/detail view's right-hand pane: a "select a run" prompt
 * when nothing is selected, otherwise the selected run's Animes/Episodes
 * counters, its progress bar, any error summary, and its manual links.
 */
export function RunHistoryDetailPane({ selectedRun }: Readonly<RunHistoryDetailPaneProps>) {
  if (selectedRun === undefined) {
    return <p className="text-sm text-muted">Select a run to see its details.</p>;
  }

  const isRunning = selectedRun.status === 'running';

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">Run {selectedRun.runId}</span>
        <Chip color={selectedRun.status === 'ok' ? 'success' : 'default'} size="sm" variant="soft">
          <Chip.Label>{selectedRun.status}</Chip.Label>
        </Chip>
      </div>

      <span className="-mb-1 text-xs font-medium text-muted">Animes</span>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
        <dt>Checked</dt>
        <dd className="text-right text-foreground">{selectedRun.animesChecked}</dd>
        <dt>Skipped</dt>
        <dd className="text-right text-default-500">{selectedRun.skippedCount}</dd>
        <dt>Up to date</dt>
        <dd className="text-right text-secondary">{selectedRun.upToDateCount}</dd>
      </dl>

      <span className="-mb-1 text-xs font-medium text-muted">Episodes</span>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
        <dt>Found</dt>
        <dd className="text-right font-medium text-warning">{selectedRun.episodesFound}</dd>
        <dt>{pendingEpisodesLabel(isRunning)}</dt>
        <dd className={`text-right font-medium ${isRunning ? 'text-primary' : 'text-default-500'}`}>
          {selectedRun.episodesDownloading}
        </dd>
        <dt>Downloaded</dt>
        <dd className="text-right font-medium text-success">{selectedRun.episodesDownloaded}</dd>
        <dt>Failed</dt>
        <dd className="text-right font-medium text-danger">{selectedRun.episodesFailed}</dd>
      </dl>

      <RunProgressBar
        episodesDownloaded={selectedRun.episodesDownloaded}
        episodesDownloading={selectedRun.episodesDownloading}
        episodesFailed={selectedRun.episodesFailed}
        episodesFound={selectedRun.episodesFound}
        isRunning={isRunning}
      />

      {selectedRun.errorSummary !== undefined && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{selectedRun.errorSummary}</p>
      )}

      <RunHistoryManualLinks manualLinks={selectedRun.manualLinks} />
    </div>
  );
}
