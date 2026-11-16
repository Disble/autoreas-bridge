import { useCallback, useState } from 'react';
import type { DownloadsSource } from '../../../../shared/contracts/download.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';

/**
 * useRunHistoryStop owns the card-level Stop control. A stop stays pending
 * only while the run it was requested for is still running: the terminal row
 * that ends the run also ends the pending state, so there is no flag to reset
 * and no way to get stuck. A refused stop releases the pending state and
 * reports the backend's message.
 *
 * @param runningRunId The run still open, if any.
 * @param source The downloads port that cancels the run.
 * @returns The stop action, whether a stop is pending, and a refusal message.
 */
export function useRunHistoryStop(runningRunId: string | undefined, source: DownloadsSource) {
  // 1. Refs

  // 2. State
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | undefined>(undefined);
  const [stopRequestedRunId, setStopRequestedRunId] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const { mutateAsync: cancelDownloadRun } = useBridgeMutation({ mutationFn: () => source.cancelDownloadRun() });

  // 5. Derived State (useMemo)
  const isStopping = stopRequestedRunId !== undefined && stopRequestedRunId === runningRunId;

  // 6. Callbacks (useCallback calling pure helpers)
  // The stopped run finalizes its own terminal row and the run-event stream
  // refreshes the list, so there is nothing to optimistically patch here: only a
  // refusal needs surfacing. The requested run id is remembered so the control can
  // stay busy until that exact run ends, and is released on refusal so a rejected
  // stop can never leave the button stuck.
  const cancelRun = useCallback(async () => {
    setCancelErrorMessage(undefined);
    setStopRequestedRunId(runningRunId);
    try {
      await cancelDownloadRun();
    } catch (error) {
      setStopRequestedRunId(undefined);
      setCancelErrorMessage(toErrorMessage(error, 'Failed to stop the download run'));
    }
  }, [cancelDownloadRun, runningRunId]);

  // 7. Effects

  return { cancelRun, isStopping, cancelErrorMessage };
}
