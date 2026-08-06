import { Button, Chip, EmptyState, Skeleton } from '@heroui/react';
import { pendingEpisodesLabel } from './run-history-panel.helpers';
import { useRunHistoryPanel } from './use-run-history-panel';
import type { RunHistoryPanelProps, RunHistoryRowViewModel } from './run-history-panel.types';
import { RunProgressBar } from './RunProgressBar';

/**
 * RunHistoryPanel renders the master/detail download run history view: a
 * selectable list of past runs on the left, and the selected run's details
 * (including any `manualLinks` recorded for `jd_offline` runs) on the
 * right. All Wails calls and selection state live in the colocated
 * `useRunHistoryPanel` hook; this component is presentation-only.
 */
export function RunHistoryPanel({ className }: Readonly<RunHistoryPanelProps>) {
  const { viewModel, cancelRun, selectRun, scrollRef, onScroll } = useRunHistoryPanel();

  if (viewModel.status === 'loading') {
    return (
      <section aria-label="Loading download run history" className={className}>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
      </section>
    );
  }

  if (viewModel.status === 'error') {
    return (
      <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
        {viewModel.errorMessage ?? 'Failed to load download run history.'}
      </p>
    );
  }

  if (viewModel.status === 'empty') {
    return (
      <EmptyState className={className}>
        <EmptyState.Root>No download runs yet. Trigger a check or wait for the next scheduled run.</EmptyState.Root>
      </EmptyState>
    );
  }

  return (
    <section aria-label="Download run history" className={`grid gap-4 sm:grid-cols-2 ${className ?? ''}`}>
      {viewModel.runInProgress && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-divider/60 px-3 py-2 sm:col-span-2">
          <span aria-live="polite" className="text-sm text-muted">
            {viewModel.isStopping
              ? 'Stopping — the run ends after the episode it is already downloading.'
              : 'A download run is in progress.'}
          </span>
          <Button
            isDisabled={viewModel.isStopping}
            isPending={viewModel.isStopping}
            onPress={() => void cancelRun()}
            size="sm"
            variant="secondary"
          >
            {viewModel.isStopping ? 'Stopping…' : 'Stop run'}
          </Button>
        </div>
      )}

      {viewModel.errorMessage !== undefined && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2" role="alert">
          {viewModel.errorMessage}
        </p>
      )}

      <div
        className="max-h-[32rem] min-h-0 overflow-x-hidden overflow-y-auto pr-1"
        data-testid="run-history-scroll"
        onScroll={onScroll}
        ref={scrollRef}
      >
        <ul aria-label="Run history list" className="flex flex-col gap-2">
          {viewModel.visibleRows.map((row: RunHistoryRowViewModel) => (
            <li key={row.runId}>
              <Button
                aria-pressed={row.isSelected}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                  row.isSelected
                    ? 'border-accent bg-accent/10 text-foreground'
                    : 'border-divider/60 bg-content1/60'
                }`}
                variant="outline"
                onPress={() => selectRun(row.runId)}
              >
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">{row.startedLabel}</span>
                  <span className="text-xs text-muted">{row.trigger}</span>
                </span>
                <Chip color={row.statusLabel === 'ok' ? 'success' : 'default'} size="sm" variant="soft">
                  <Chip.Label>{row.statusLabel}</Chip.Label>
                </Chip>
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-divider/60 bg-content1/40 p-4">
        {viewModel.selectedRun === undefined ? (
          <p className="text-sm text-muted">Select a run to see its details.</p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">Run {viewModel.selectedRun.runId}</span>
              <Chip color={viewModel.selectedRun.status === 'ok' ? 'success' : 'default'} size="sm" variant="soft">
                <Chip.Label>{viewModel.selectedRun.status}</Chip.Label>
              </Chip>
            </div>

            <span className="-mb-1 text-xs font-medium text-muted">Animes</span>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
              <dt>Checked</dt>
              <dd className="text-right text-foreground">{viewModel.selectedRun.animesChecked}</dd>
              <dt>Skipped</dt>
              <dd className="text-right text-default-500">{viewModel.selectedRun.skippedCount}</dd>
              <dt>Up to date</dt>
              <dd className="text-right text-secondary">{viewModel.selectedRun.upToDateCount}</dd>
            </dl>

            <span className="-mb-1 text-xs font-medium text-muted">Episodes</span>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
              <dt>Found</dt>
              <dd className="text-right font-medium text-warning">{viewModel.selectedRun.episodesFound}</dd>
              <dt>{pendingEpisodesLabel(viewModel.selectedRun.status === 'running')}</dt>
              <dd
                className={`text-right font-medium ${
                  viewModel.selectedRun.status === 'running' ? 'text-primary' : 'text-default-500'
                }`}
              >
                {viewModel.selectedRun.episodesDownloading}
              </dd>
              <dt>Downloaded</dt>
              <dd className="text-right font-medium text-success">{viewModel.selectedRun.episodesDownloaded}</dd>
              <dt>Failed</dt>
              <dd className="text-right font-medium text-danger">{viewModel.selectedRun.episodesFailed}</dd>
            </dl>

            <RunProgressBar
              episodesFound={viewModel.selectedRun.episodesFound}
              episodesDownloaded={viewModel.selectedRun.episodesDownloaded}
              episodesDownloading={viewModel.selectedRun.episodesDownloading}
              episodesFailed={viewModel.selectedRun.episodesFailed}
              isRunning={viewModel.selectedRun.status === 'running'}
            />

            {viewModel.selectedRun.errorSummary !== undefined && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                {viewModel.selectedRun.errorSummary}
              </p>
            )}

            {viewModel.selectedRun.manualLinks !== undefined && viewModel.selectedRun.manualLinks.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-medium text-foreground">Manual links (JDownloader was offline)</span>
                <ul className="flex flex-col gap-2">
                  {viewModel.selectedRun.manualLinks.map((link) => (
                    <li key={`${link.anime}-${link.episode}`} className="min-w-0 rounded-lg border border-divider/60 p-2">
                      <p className="font-medium text-foreground">
                        <span>{link.anime}</span> — Episode {link.episode}
                      </p>
                      {/*
                       * Hoster URLs are long, unbroken tokens. Without break-all they
                       * push the card wider than its column and put a horizontal
                       * scrollbar on the whole window.
                       */}
                      <ul className="flex min-w-0 flex-col gap-1">
                        {link.links.map((url) => (
                          <li key={url} className="min-w-0">
                            <a
                              className="block break-all text-primary underline"
                              href={url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
