import { useCallback } from 'react';
import { toast } from '@heroui/react';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_SETTINGS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { AUTO_START_ERROR_MESSAGE, AUTO_START_QUERY_KEY, AUTO_START_SAVED_MESSAGE } from './auto-start-panel.constants';
import { toAutoStartSaveFailure } from './auto-start-panel.helpers';
import type { AutoStartPanelProps, AutoStartView } from './auto-start-panel.types';

/**
 * Reads the Windows login-launch preference through `useBridgeQuery` (module
 * `settings`) and saves a change through `useBridgeMutation`, re-reading the
 * stored value once it is saved.
 * @param props The panel props; `source` replaces the Settings port in tests.
 * @returns The preference view, the save state and the change action.
 */
export function useAutoStartPanel(props: Readonly<AutoStartPanelProps> = {}) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const source = props.source ?? BRIDGE_SETTINGS_SOURCE;

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: AUTO_START_QUERY_KEY,
    queryFn: () => source.getAutoStartEnabled(),
    module: 'settings',
  });
  const { refetch } = query;
  const save = useBridgeMutation({
    mutationFn: (enabled: boolean) => source.setAutoStartEnabled(enabled),
    onSuccess: async () => {
      toast.success(AUTO_START_SAVED_MESSAGE);
      await refetch();
    },
    onError: () => {
      toast.danger(AUTO_START_ERROR_MESSAGE);
    },
  });

  // 5. Derived State
  const view: AutoStartView = toAsyncView(query);
  const errorMessage = toAutoStartSaveFailure(save);

  // 6. Callbacks (useCallback calling pure helpers)
  const { mutate } = save;
  const onEnabledChange = useCallback((nextEnabled: boolean) => mutate(nextEnabled), [mutate]);

  // 7. Effects

  return {
    view,
    isSaving: save.isPending,
    errorMessage,
    onEnabledChange,
  };
}
