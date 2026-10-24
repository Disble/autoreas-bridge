import { Alert, EmptyState } from '@heroui/react';
import { Icon } from '@iconify/react';
import clockIcon from '@iconify-icons/solar/clock-circle-bold';
import { LoadingBars } from '../../../../shared/ui/LoadingBars/LoadingBars';
import { RUN_HISTORY_STOPPING_NOTE } from './run-history-panel.constants';
import { useRunHistoryPanel } from './use-run-history-panel';
import type { RunHistoryPanelProps } from './run-history-panel.types';
import { RunHistoryDetailPane } from './RunHistoryDetailPane';
import { RunHistoryErrorAlert } from './RunHistoryErrorAlert';
import { RunHistoryHeaderTools } from './RunHistoryHeaderTools';
import { RunHistoryMasterList } from './RunHistoryMasterList';

/**
 * RunHistoryPanel renders the master/detail download run history view: the
 * run-level controls (Stop run, Problems filter), a selectable list of past
 * runs under day headers on the left, and the selected run's per-anime
 * breakdown on the right. All Wails calls and selection state live in the
 * colocated `useRunHistoryPanel` hook; this component composes its colocated
 * sibling sections and stays presentation-only itself.
 */
export function RunHistoryPanel({ className, storySource }: Readonly<RunHistoryPanelProps>) {
  const { viewModel, cancelRun, selectRun, scrollRef, onScroll, toggleProblems, copyText, editAnime } = useRunHistoryPanel(undefined, { storySource });

  if (viewModel.status === 'loading') {
    return <LoadingBars className={className} count={3} label="Loading download run history" />;
  }

  if (viewModel.status === 'error') {
    return <RunHistoryErrorAlert message={viewModel.errorMessage ?? 'Failed to load download run history.'} />;
  }

  if (viewModel.status === 'empty') {
    return (
      <EmptyState className={className}>
        <EmptyState.Root>No download runs yet. Trigger a check or wait for the next scheduled run.</EmptyState.Root>
      </EmptyState>
    );
  }

  return (
    <section aria-label="Download run history" className={`flex flex-col gap-4 ${className ?? ''}`}>
      <RunHistoryHeaderTools
        isStopping={viewModel.isStopping}
        problemCount={viewModel.problemCount}
        problemsOnly={viewModel.problemsOnly}
        runInProgress={viewModel.runInProgress}
        onCancel={cancelRun}
        onToggleProblems={toggleProblems}
      />

      {viewModel.runInProgress && viewModel.isStopping ? (
        <Alert aria-live="polite" className="bg-default">
          <Alert.Indicator>
            <Icon aria-hidden="true" className="size-[18px] text-muted" icon={clockIcon} />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Description>{RUN_HISTORY_STOPPING_NOTE}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {viewModel.errorMessage === undefined ? null : <RunHistoryErrorAlert message={viewModel.errorMessage} />}

      <div className="grid gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <RunHistoryMasterList days={viewModel.visibleDays} onScroll={onScroll} onSelectRun={selectRun} scrollRef={scrollRef} />
        <RunHistoryDetailPane covers={viewModel.covers} detail={viewModel.detail} onCopy={copyText} onEditAnime={editAnime} />
      </div>
    </section>
  );
}
