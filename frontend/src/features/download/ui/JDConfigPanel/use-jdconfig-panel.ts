import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { JDCONFIG_PANEL_EMPTY_STATUS } from './jdconfig-panel.constants';
import { toJDConfigFormValues, toJDConfigInput } from './jdconfig-panel.helpers';
import type { JDConfigFormValues } from './jdconfig-panel.types';

/**
 * useJDConfigPanel loads the live JD account/device status, exposes an
 * editable form derived from it (with the password field always starting
 * blank — it is write-only and never echoed back), and persists edits via
 * `setJDConfig`, refreshing the live status afterward.
 */
export function useJDConfigPanel(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [form, setForm] = useState<JDConfigFormValues>({
    email: '',
    plaintextPassword: '',
    deviceName: '',
    exePathOverride: '',
    defaultDestDir: '',
  });
  const [liveStatus, setLiveStatus] = useState(JDCONFIG_PANEL_EMPTY_STATUS);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);
  const [saveSucceeded, setSaveSucceeded] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(async () => {
    try {
      const status = await source.getJDStatus();
      setLiveStatus(status);
      setForm(toJDConfigFormValues(status));
      setLoadErrorMessage(undefined);
    } catch (error) {
      setLoadErrorMessage(error instanceof Error ? error.message : 'Failed to load JD status');
    } finally {
      setHasLoaded(true);
    }
  }, [source]);

  const updateField = useCallback(<K extends keyof JDConfigFormValues>(field: K, value: JDConfigFormValues[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  }, []);

  const save = useCallback(async () => {
    setIsSaving(true);
    setSaveErrorMessage(undefined);
    setSaveSucceeded(false);

    try {
      await source.setJDConfig(toJDConfigInput(form));
      await refresh();
      setForm((previous) => ({ ...previous, plaintextPassword: '' }));
      setSaveSucceeded(true);
    } catch (error) {
      setSaveErrorMessage(error instanceof Error ? error.message : 'Failed to save JD configuration');
    } finally {
      setIsSaving(false);
    }
  }, [form, refresh, source]);

  // 7. Effects
  useEffect(() => {
    void refresh();
  }, [refresh]);

  let status: 'loading' | 'error' | 'ready' = 'ready';

  if (!hasLoaded) {
    status = 'loading';
  } else if (loadErrorMessage !== undefined) {
    status = 'error';
  }

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
