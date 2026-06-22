import { useCallback, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import { toManualTriggerResult } from './manual-trigger-button.helpers';
import type { ManualTriggerButtonViewModel } from './manual-trigger-button.types';

/**
 * useManualTriggerButton calls `triggerDownloadCheck` and tracks the
 * idle/triggering/already-in-progress/error/success lifecycle of a single
 * manual download check. All Wails calls live here; `ManualTriggerButton`
 * renders the returned view model only.
 */
export function useManualTriggerButton(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [viewModel, setViewModel] = useState<ManualTriggerButtonViewModel>({ status: 'idle' });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const trigger = useCallback(async () => {
    setViewModel({ status: 'triggering' });

    try {
      const response = await source.triggerDownloadCheck();
      setViewModel(toManualTriggerResult(response));
    } catch (error) {
      setViewModel({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Failed to trigger download check',
      });
    }
  }, [source]);

  // 7. Effects

  return {
    viewModel,
    trigger,
  };
}
