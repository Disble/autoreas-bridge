import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import { connectDownloadRuntimeStore, useDownloadRuntimeStore } from '../../../../shared/store/download-runtime-store';
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);
  const [dailyTimeEdit, setDailyTimeEdit] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  const config = useDownloadRuntimeStore((state) => state.scheduleConfig);
  const hasLoaded = useDownloadRuntimeStore((state) => state.scheduleHasLoaded);
  const loadErrorMessage = useDownloadRuntimeStore((state) => state.scheduleErrorMessage);
  const refreshSchedule = useDownloadRuntimeStore((state) => state.refreshSchedule);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const dailyTimeDraft = dailyTimeEdit ?? config.dailyTimeHHMM;

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => refreshSchedule(source), [refreshSchedule, source]);

  const save = useCallback(
    async (edits: ScheduleSaveEdits) => {
      setIsSaving(true);
      setSaveErrorMessage(undefined);

      try {
        const result = await source.setScheduleConfig(toScheduleSaveRequest(config, edits));

        // The Wails binding reports outcome as a string ("ok" or a human-readable
        // reason) rather than throwing, so a non-"ok" result must be surfaced
        // explicitly — otherwise a rejected save reverts silently with no feedback.
        if (result !== 'ok') {
          setSaveErrorMessage(result || 'Failed to save schedule config');
          return;
        }

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

  const commitDailyTime = useCallback(
    async () => {
      if (dailyTimeDraft === '' || dailyTimeDraft === config.dailyTimeHHMM) {
        setDailyTimeEdit(undefined);
        return;
      }
      await setDailyTime(dailyTimeDraft);
      setDailyTimeEdit(undefined);
    },
    [config.dailyTimeHHMM, dailyTimeDraft, setDailyTime],
  );

  const setDailyTimeDraft = useCallback((nextDailyTimeDraft: string) => {
    setDailyTimeEdit(nextDailyTimeDraft);
  }, []);

  const setWeekdays = useCallback(
    (enabledWeekdays: number) =>
      save({ enabled: config.enabled, dailyTimeHHMM: config.dailyTimeHHMM, enabledWeekdays }),
    [config.dailyTimeHHMM, config.enabled, save],
  );

  // 7. Effects
  useEffect(() => {
    connectDownloadRuntimeStore(source);
  }, [source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const status = !hasLoaded ? 'loading' : loadErrorMessage !== undefined ? 'error' : 'ready';

  return {
    status,
    viewModel: toSchedulePanelViewModel(config),
    dailyTimeDraft,
    isSaving,
    saveErrorMessage,
    setEnabled,
    setDailyTime,
    setDailyTimeDraft,
    commitDailyTime,
    setWeekdays,
  };
}
