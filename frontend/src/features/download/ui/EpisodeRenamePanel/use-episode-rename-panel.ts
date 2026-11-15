import { useCallback, useState } from 'react';
import type { DownloadsSource } from '../../../../shared/contracts/download.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { DOWNLOADS_CONFIG_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import type { EpisodeRenamePanelStatus } from './episode-rename-panel.types';

/**
 * useEpisodeRenamePanel loads the persisted episode auto-rename opt-in and
 * exposes a `setEnabled` mutation that persists it.
 *
 * The toggle flips optimistically so it never feels laggy, and a refused save
 * rolls it back. A toggle that claims a setting the backend never stored is
 * worse than a slow one, because the next download quietly disagrees with the UI.
 *
 * @param source The downloads port the setting is read and saved through.
 * @returns The panel state and its toggle action.
 */
export function useEpisodeRenamePanel(source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE) {
  // 2. State
  const [toggledEnabled, setToggledEnabled] = useState<boolean | undefined>(undefined);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);

  // 4. Queries/Mutations
  const configQuery = useBridgeQuery({ queryKey: DOWNLOADS_CONFIG_KEY, queryFn: () => source.getDownloadConfig(), module: 'downloads' });
  const { mutateAsync: saveEnabled, isPending: isSaving } = useBridgeMutation({
    mutationFn: (next: boolean) => source.setEpisodeRenameEnabled(next),
    // A stored value re-reads the config, so a later mount starts from what was saved.
    onSuccess: () => {
      void configQuery.refetch();
    },
  });

  // 5. Derived State (useMemo)
  const configView = toAsyncView(configQuery, () => false);
  const enabled = toggledEnabled ?? (configView.kind === 'ready' ? configView.data.renameEpisodes : false);
  const loadErrorMessage =
    configView.kind === 'failure' ? toErrorMessage(configQuery.error, 'Failed to load the episode rename setting') : undefined;
  const errorMessage = saveErrorMessage ?? loadErrorMessage;
  let status: EpisodeRenamePanelStatus = 'ready';
  if (configView.kind === 'loading') {
    status = 'loading';
  } else if (errorMessage !== undefined && !isSaving) {
    status = 'error';
  }

  // 6. Callbacks (useCallback calling pure helpers)
  const setEnabled = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setToggledEnabled(next);
      setSaveErrorMessage(undefined);

      try {
        await saveEnabled(next);
      } catch (error) {
        setToggledEnabled(previous);
        setSaveErrorMessage(toErrorMessage(error, 'Failed to save the episode rename setting'));
      }
    },
    [enabled, saveEnabled],
  );

  return {
    status,
    enabled,
    isSaving,
    errorMessage,
    setEnabled,
  };
}
