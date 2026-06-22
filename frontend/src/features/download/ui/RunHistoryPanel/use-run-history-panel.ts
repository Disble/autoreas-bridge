import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { DownloadRunView } from '../../../../shared/contracts/download.types';
import { toRunHistoryPanelViewModel } from './run-history-panel.helpers';

/**
 * useRunHistoryPanel loads the download run history and exposes a
 * `selectRun` action for the master/detail UI: the detail pane (including
 * any `manualLinks` for `jd_offline` runs) is resolved purely from the
 * loaded run list, with no extra round-trip per selection.
 */
export function useRunHistoryPanel(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [runs, setRuns] = useState<readonly DownloadRunView[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const selectRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
  }, []);

  // 7. Effects
  useEffect(() => {
    let active = true;

    source
      .listDownloadRuns()
      .then((nextRuns) => {
        if (!active) {
          return;
        }

        setRuns(nextRuns);
        setErrorMessage(undefined);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : 'Failed to load download run history');
      })
      .finally(() => {
        if (active) {
          setHasLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [source]);

  const baseViewModel = toRunHistoryPanelViewModel(runs, selectedRunId);
  const viewModel =
    errorMessage !== undefined
      ? { ...baseViewModel, status: 'error' as const, errorMessage }
      : !hasLoaded
        ? { ...baseViewModel, status: 'loading' as const }
        : baseViewModel;

  return {
    viewModel,
    selectRun,
  };
}
