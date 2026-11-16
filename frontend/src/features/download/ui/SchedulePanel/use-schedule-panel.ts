import { useCallback, useEffect, useState } from 'react';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.types';
import type { DownloadsSource, ScheduleConfig } from '../../../../shared/contracts/download.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { useDownloadSchedule } from '../../../../shared/hooks/use-missed-schedule-notice/use-download-schedule';
import { useMissedScheduleNotice } from '../../../../shared/hooks/use-missed-schedule-notice/use-missed-schedule-notice';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { DOWNLOADS_READINESS_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { usePreferencesStore } from '../../../../shared/store/preferences-store/preferences-store';
import { SCHEDULE_PANEL_LOADING_CONFIG } from './schedule-panel.constants';
import { scheduleLoadStatus, toSchedulePanelViewModel, toScheduleReadinessViewModel, toScheduleSaveRequest } from './schedule-panel.helpers';
import type { ScheduleSaveEdits } from './schedule-panel.types';

/**
 * useSchedulePanel loads the persisted scheduler config and exposes
 * `setEnabled`/`setDailyTime` mutations that persist the full
 * `ScheduleConfig` via `setScheduleConfig`, refreshing the view model
 * afterward. The schedule and the readiness snapshot are downloads-module queries.
 *
 * @param source The downloads port the panel reads and writes through.
 * @param prefSource The preferences port the season-mode flag loads through.
 * @returns The panel state and its actions.
 */
export function useSchedulePanel(
  source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE,
  prefSource: PreferencesSource = preferencesSource,
) {
  // 1. Refs

  // 2. State
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);
  const [dailyTimeEdit, setDailyTimeEdit] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  const missedScheduleNotice = useMissedScheduleNotice(source);
  const seasonMode = usePreferencesStore((state) => state.seasonMode);
  const refreshPreferences = usePreferencesStore((state) => state.refresh);

  // 4. Queries/Mutations
  const scheduleQuery = useDownloadSchedule(source);
  const readinessQuery = useBridgeQuery({
    queryKey: DOWNLOADS_READINESS_KEY,
    queryFn: () => source.listDownloadReadiness(),
    module: 'downloads',
  });
  const { mutateAsync: setScheduleConfig } = useBridgeMutation({ mutationFn: (request: ScheduleConfig) => source.setScheduleConfig(request) });

  // 5. Derived State (useMemo)
  const scheduleView = toAsyncView(scheduleQuery);
  const config = scheduleQuery.data ?? SCHEDULE_PANEL_LOADING_CONFIG;
  const dailyTimeDraft = dailyTimeEdit ?? config.dailyTimeHHMM;
  const { refetch: refetchSchedule } = scheduleQuery;
  const { refetch: refetchReadiness } = readinessQuery;
  // A failed readiness read shows no snapshot, and its banner steps aside while the retry runs.
  const readinessSnapshot = readinessQuery.isError ? undefined : readinessQuery.data;
  const readinessErrorMessage =
    readinessQuery.isError && !readinessQuery.isFetching ? toErrorMessage(readinessQuery.error, 'Failed to load download readiness') : undefined;
  const status = scheduleLoadStatus(scheduleView.kind);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(async () => {
    await refetchSchedule();
  }, [refetchSchedule]);

  const refreshReadiness = useCallback(async () => {
    await refetchReadiness();
  }, [refetchReadiness]);

  const save = useCallback(
    async (edits: ScheduleSaveEdits) => {
      setIsSaving(true);
      setSaveErrorMessage(undefined);

      try {
        await setScheduleConfig(toScheduleSaveRequest(config, edits));
        await refresh();
      } catch (error) {
        setSaveErrorMessage(toErrorMessage(error, 'Failed to save schedule config'));
      } finally {
        setIsSaving(false);
      }
    },
    [config, refresh, setScheduleConfig],
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
    void refreshPreferences(prefSource);
  }, [refreshPreferences, prefSource]);


  return {
    status,
    viewModel: {
      ...toSchedulePanelViewModel(config, missedScheduleNotice.decisionNotice),
      seasonModeActive: seasonMode,
      readiness: readinessSnapshot === undefined ? undefined : toScheduleReadinessViewModel(readinessSnapshot),
    },
    dailyTimeDraft,
    isSaving,
    saveErrorMessage,
    isResolvingMissedAction: missedScheduleNotice.isResolving,
    missedActionMessage: missedScheduleNotice.actionMessage,
    readinessErrorMessage,
    refreshReadiness,
    setEnabled,
    setDailyTime,
    setDailyTimeDraft,
    commitDailyTime,
    setWeekdays,
    runMissedScheduleNow: missedScheduleNotice.runNow,
    ignoreMissedSchedule: missedScheduleNotice.ignore,
  };
}
