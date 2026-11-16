import { useCallback, useState } from 'react';
import type { DownloadsSource } from '../../../../shared/contracts/download.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { downloadsKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { JDCONFIG_PANEL_EMPTY_STATUS } from './jdconfig-panel.constants';
import { toJDConfigFormValues, toJDConfigInput } from './jdconfig-panel.helpers';
import type { JDConfigFormValues } from './jdconfig-panel.types';

/**
 * useJDConfigPanel loads the live JD account/device status, exposes an
 * editable form derived from it (with the password field always starting
 * blank — it is write-only and never echoed back), and persists edits via
 * `setJDConfig`, re-reading the live status afterward. The form follows the
 * status until the user edits it, and again once a save is stored.
 *
 * @param source The downloads port the status is read and saved through.
 * @returns The panel state and its form actions.
 */
export function useJDConfigPanel(source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE) {
  // 2. State
  const [formDraft, setFormDraft] = useState<JDConfigFormValues | undefined>(undefined);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);
  const [saveSucceeded, setSaveSucceeded] = useState(false);

  // 4. Queries/Mutations
  const statusQuery = useBridgeQuery({ queryKey: downloadsKeys.key('jd-status'), queryFn: () => source.getJDStatus(), module: 'downloads' });
  const { mutateAsync: saveJDConfig, isPending: isSaving } = useBridgeMutation({
    mutationFn: (values: JDConfigFormValues) => source.setJDConfig(toJDConfigInput(values)),
  });

  // 5. Derived State (useMemo)
  const statusView = toAsyncView(statusQuery, () => false);
  const liveStatus = statusQuery.data ?? JDCONFIG_PANEL_EMPTY_STATUS;
  const form = formDraft ?? toJDConfigFormValues(liveStatus);
  let status: 'loading' | 'error' | 'ready' = 'ready';
  if (statusView.kind === 'loading') {
    status = 'loading';
  } else if (statusView.kind === 'failure') {
    status = 'error';
  }
  const { refetch } = statusQuery;

  // 6. Callbacks (useCallback calling pure helpers)
  const updateField = useCallback(
    <K extends keyof JDConfigFormValues>(field: K, value: JDConfigFormValues[K]) => {
      setFormDraft((previous) => ({ ...(previous ?? form), [field]: value }));
    },
    [form],
  );

  const save = useCallback(async () => {
    setSaveErrorMessage(undefined);
    setSaveSucceeded(false);

    try {
      await saveJDConfig(form);
      await refetch();
      setFormDraft(undefined);
      setSaveSucceeded(true);
    } catch (error) {
      setSaveErrorMessage(toErrorMessage(error, 'Failed to save JD configuration'));
    }
  }, [form, refetch, saveJDConfig]);

  return {
    status,
    form,
    liveStatus,
    isSaving,
    saveErrorMessage,
    saveSucceeded,
    updateField,
    save,
  };
}
