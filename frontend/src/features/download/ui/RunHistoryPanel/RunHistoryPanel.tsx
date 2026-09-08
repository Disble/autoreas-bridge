import { EmptyState } from '@heroui/react';
import { LoadingBars } from '../../../../shared/ui/LoadingBars/LoadingBars';
import { useRunHistoryPanel } from './use-run-history-panel';
import type { RunHistoryPanelProps } from './run-history-panel.types';
import { RunHistoryDetailPane } from './RunHistoryDetailPane';
import { RunHistoryMasterList } from './RunHistoryMasterList';
import { RunHistoryStopBanner } from './RunHistoryStopBanner';

/**
 * RunHistoryPanel renders the master/detail download run history view: a
 * selectable list of past runs on the left, and the selected run's details
 * (including any `manualLinks` recorded for `jd_offline` runs) on the
 * right. All Wails calls and selection state live in the colocated
 * `useRunHistoryPanel` hook; this component composes its colocated sibling
 * sections and stays presentation-only itself.
 */
export function RunHistoryPanel({ className }: Readonly<RunHistoryPanelProps>) {
  const { viewModel, cancelRun, selectRun, scrollRef, onScroll } = useRunHistoryPanel();

  if (viewModel.status === 'loading') {
    return <LoadingBars className={className} count={3} label="Loading download run history" />;
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
      <RunHistoryStopBanner isStopping={viewModel.isStopping} onCancel={cancelRun} runInProgress={viewModel.runInProgress} />

      {viewModel.errorMessage !== undefined && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2" role="alert">
          {viewModel.errorMessage}
        </p>
      )}

      <RunHistoryMasterList onScroll={onScroll} onSelectRun={selectRun} rows={viewModel.visibleRows} scrollRef={scrollRef} />

      <div className="rounded-lg border border-divider/60 bg-content1/40 p-4">
        <RunHistoryDetailPane selectedRun={viewModel.selectedRun} />
      </div>
    </section>
  );
}
