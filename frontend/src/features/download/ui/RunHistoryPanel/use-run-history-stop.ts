import { useCallback, useState } from 'react';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';

/**
 * useRunHistoryStop owns the card-level Stop control. A stop stays pending
 * only while the run it was requested for is still running: the terminal row
 * that ends the run also ends the pending state, so there is no flag to reset
 * and no way to get stuck. A refused stop releases the pending state and
 * reports the backend's message.
 *
 * @param runningRunId The run still open, if any.
 * @param source The download port that cancels the run.
 * @returns The stop action, whether a stop is pending, and a refusal message.
 */
export function useRunHistoryStop(runningRunId: string | undefined, source: DownloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | undefined>(undefined);
  const [stopRequestedRunId, setStopRequestedRunId] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

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
    const result = await source.cancelDownloadRun();
    if (result !== 'ok') {
      setStopRequestedRunId(undefined);
      setCancelErrorMessage(result);
    }
  }, [runningRunId, source]);

  // 7. Effects

  return { cancelRun, isStopping, cancelErrorMessage };
}
