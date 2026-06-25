import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { ScheduleConfig } from '../../../../shared/contracts/download.types';
import { SCHEDULE_PANEL_EMPTY_CONFIG } from './schedule-panel.constants';
import { toSchedulePanelViewModel, toScheduleSaveRequest } from './schedule-panel.helpers';
import type { ScheduleSaveEdits } from './schedule-panel.types';

/**
 * useSchedulePanel loads the persisted scheduler config and exposes
 * `setEnabled`/`setDailyTime` mutations that persist the full
 * `ScheduleConfig` via `setScheduleConfig`, refreshing the view model
 * afterward.
 */
export function useSchedulePanel(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [config, setConfig] = useState<ScheduleConfig>(SCHEDULE_PANEL_EMPTY_CONFIG);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(async () => {
    try {
      const nextConfig = await source.getScheduleConfig();
      setConfig(nextConfig);
      setLoadErrorMessage(undefined);
    } catch (error) {
      setLoadErrorMessage(error instanceof Error ? error.message : 'Failed to load schedule config');
    } finally {
      setHasLoaded(true);
    }
  }, [source]);

  const save = useCallback(
    async (edits: ScheduleSaveEdits) => {
      setIsSaving(true);
      setSaveErrorMessage(undefined);

      try {
        await source.setScheduleConfig(toScheduleSaveRequest(config, edits));
        await refresh();
      } catch (error) {
        setSaveErrorMessage(error instanceof Error ? error.message : 'Failed to save schedule config');
      } finally {
        setIsSaving(false);
      }
    },
    [config, refresh, source],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => save({ enabled, dailyTimeHHMM: config.dailyTimeHHMM, enabledWeekdays: config.enabledWeekdays }),
    [config.dailyTimeHHMM, config.enabledWeekdays, save],
  );

  const setDailyTime = useCallback(
    (dailyTimeHHMM: string) => save({ enabled: config.enabled, dailyTimeHHMM, enabledWeekdays: config.enabledWeekdays }),
    [config.enabled, config.enabledWeekdays, save],
  );

  const setWeekdays = useCallback(
    (enabledWeekdays: number) =>
      save({ enabled: config.enabled, dailyTimeHHMM: config.dailyTimeHHMM, enabledWeekdays }),
    [config.dailyTimeHHMM, config.enabled, save],
  );

  // 7. Effects
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const status = !hasLoaded ? 'loading' : loadErrorMessage !== undefined ? 'error' : 'ready';

  return {
    status,
    viewModel: toSchedulePanelViewModel(config),
    isSaving,
    saveErrorMessage,
    setEnabled,
    setDailyTime,
    setWeekdays,
  };
}
