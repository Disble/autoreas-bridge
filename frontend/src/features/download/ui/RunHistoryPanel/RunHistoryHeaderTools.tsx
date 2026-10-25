import { Button } from '@heroui/react';
import { Icon } from '@iconify/react';
import stopIcon from '@iconify-icons/solar/stop-bold';
import type { RunHistoryHeaderToolsProps } from './run-history-panel.types';
import { RunHistoryProblemsFilter } from './RunHistoryProblemsFilter';

/**
 * The card-level controls of the run history: Stop run while a run is open
 * (busy as "Stopping…" until that run ends) and the Problems filter when any
 * run had a problem. Renders nothing when neither applies.
 */
export function RunHistoryHeaderTools({ runInProgress, isStopping, onCancel, problemCount, problemsOnly, onToggleProblems }: Readonly<RunHistoryHeaderToolsProps>) {
  if (!runInProgress && problemCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2" data-testid="run-history-tools">
      {runInProgress ? (
        <Button className="rounded-full" isDisabled={isStopping} isPending={isStopping} size="sm" variant="tertiary" onPress={() => void onCancel()}>
          {isStopping ? null : <Icon aria-hidden="true" className="size-4" icon={stopIcon} />}
          {isStopping ? 'Stopping…' : 'Stop run'}
        </Button>
      ) : null}
      {problemCount > 0 ? <RunHistoryProblemsFilter count={problemCount} isOn={problemsOnly} onToggle={onToggleProblems} /> : null}
    </div>
  );
}
