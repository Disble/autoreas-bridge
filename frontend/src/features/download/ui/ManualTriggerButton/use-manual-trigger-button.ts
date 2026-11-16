import { useCallback, useState } from 'react';
import type { DownloadsSource } from '../../../../shared/contracts/download.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { toManualTriggerFailure } from './manual-trigger-button.helpers';
import type { ManualTriggerButtonViewModel } from './manual-trigger-button.types';

/**
 * useManualTriggerButton runs `triggerDownloadCheck` and tracks the
 * idle/triggering/already-in-progress/error/success lifecycle of a single
 * manual download check. `ManualTriggerButton` renders the returned view model only.
 *
 * @param source The downloads port the check is started through.
 * @returns The view model and the trigger action.
 */
export function useManualTriggerButton(source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE) {
  // 1. Refs

  // 2. State
  const [viewModel, setViewModel] = useState<ManualTriggerButtonViewModel>({ status: 'idle' });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const { mutateAsync: triggerDownloadCheck } = useBridgeMutation({ mutationFn: () => source.triggerDownloadCheck() });

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const trigger = useCallback(async () => {
    setViewModel({ status: 'triggering' });

    try {
      await triggerDownloadCheck();
      setViewModel({ status: 'success' });
    } catch (error) {
      setViewModel(toManualTriggerFailure(toErrorMessage(error, 'Failed to trigger download check')));
    }
  }, [triggerDownloadCheck]);

  // 7. Effects

  return {
    viewModel,
    trigger,
  };
}
