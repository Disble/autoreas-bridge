import { useCallback, useEffect, useMemo } from 'react';
import type { DownloadsSource } from '../../contracts/download.types';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../query/use-bridge-mutation/use-bridge-mutation';
import { useDownloadRuntimeStore } from '../../store/download-runtime-store/download-runtime-store';
import { formatMissedScheduleActionMessage, missedNoticeReset, selectMissedNotice, shouldRefreshMissedResult } from './missed-schedule-notice.helpers';
import type { MissedScheduleNoticeController } from './use-missed-schedule-notice.types';
import { useDownloadSchedule } from './use-download-schedule';

/**
 * Shares the backend-owned missed schedule notice across Today, Downloads, and
 * the app-shell failure alert while keeping renderer-session UI state in one
 * place. The notice itself is the schedule query's `missedNotice`; the
 * decisions about it (hidden, shown as a failure) are renderer-session state.
 *
 * @param source The downloads port the schedule and the two actions go through.
 * @returns The notice controller.
 */
export function useMissedScheduleNotice(
  source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE,
): MissedScheduleNoticeController {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const hiddenMissedNoticeDate = useDownloadRuntimeStore((state) => state.hiddenMissedNoticeDate);
  const activeMissedFailureDate = useDownloadRuntimeStore((state) => state.activeMissedFailureDate);
  const isResolving = useDownloadRuntimeStore((state) => state.missedNoticeIsResolving);
  const actionMessage = useDownloadRuntimeStore((state) => state.missedNoticeActionMessage);
  const hideMissedNoticeDecision = useDownloadRuntimeStore((state) => state.hideMissedNoticeDecision);
  const restoreMissedNoticeDecision = useDownloadRuntimeStore((state) => state.restoreMissedNoticeDecision);
  const showMissedScheduleFailure = useDownloadRuntimeStore((state) => state.showMissedScheduleFailure);
  const clearMissedScheduleFailure = useDownloadRuntimeStore((state) => state.clearMissedScheduleFailure);
  const setMissedNoticeActionMessage = useDownloadRuntimeStore((state) => state.setMissedNoticeActionMessage);
  const setMissedNoticeResolving = useDownloadRuntimeStore((state) => state.setMissedNoticeResolving);

  // 4. Queries/Mutations
  const scheduleQuery = useDownloadSchedule(source);
  const { mutateAsync: runMissedScheduleNow } = useBridgeMutation({ mutationFn: (localDate: string) => source.runMissedScheduleNow(localDate) });
  const { mutateAsync: ignoreMissedSchedule } = useBridgeMutation({ mutationFn: (localDate: string) => source.ignoreMissedSchedule(localDate) });

  // 5. Derived State (useMemo)
  const backendNotice = scheduleQuery.data?.missedNotice;
  const { refetch } = scheduleQuery;
  const decisionNotice = useMemo(() => selectMissedNotice(backendNotice, hiddenMissedNoticeDate, false), [backendNotice, hiddenMissedNoticeDate]);
  const failureNotice = useMemo(() => selectMissedNotice(backendNotice, activeMissedFailureDate, true), [activeMissedFailureDate, backendNotice]);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const runNow = useCallback(
    async (localDate: string) => {
      setMissedNoticeResolving(true);
      setMissedNoticeActionMessage(undefined);
      hideMissedNoticeDecision(localDate);

      try {
        const result = await runMissedScheduleNow(localDate);
        const message = formatMissedScheduleActionMessage(result);

        if (message !== undefined) {
          setMissedNoticeActionMessage(message);
        }

        if (result.kind === 'settled') {
          clearMissedScheduleFailure();
        } else {
          restoreMissedNoticeDecision();
          if (result.kind === 'unresolved_terminal') showMissedScheduleFailure(localDate);
        }

        if (shouldRefreshMissedResult(result.kind, true)) await refresh();
      } catch (error) {
        restoreMissedNoticeDecision();
        setMissedNoticeActionMessage(error instanceof Error ? error.message : 'Failed to resolve the missed schedule notice.');
      } finally {
        setMissedNoticeResolving(false);
      }
    },
    [
      clearMissedScheduleFailure,
      hideMissedNoticeDecision,
      refresh,
      restoreMissedNoticeDecision,
      runMissedScheduleNow,
      setMissedNoticeActionMessage,
      setMissedNoticeResolving,
      showMissedScheduleFailure,
    ],
  );

  const ignore = useCallback(
    async (localDate: string) => {
      setMissedNoticeResolving(true);
      setMissedNoticeActionMessage(undefined);

      try {
        const result = await ignoreMissedSchedule(localDate);
        const message = formatMissedScheduleActionMessage(result);

        if (message !== undefined) {
          setMissedNoticeActionMessage(message);
        }

        if (result.kind === 'settled') clearMissedScheduleFailure();
        if (shouldRefreshMissedResult(result.kind, false)) await refresh();
      } catch (error) {
        setMissedNoticeActionMessage(error instanceof Error ? error.message : 'Failed to resolve the missed schedule notice.');
      } finally {
        setMissedNoticeResolving(false);
      }
    },
    [clearMissedScheduleFailure, ignoreMissedSchedule, refresh, setMissedNoticeActionMessage, setMissedNoticeResolving],
  );

  // 7. Effects
  useEffect(() => {
    const { restore, clear } = missedNoticeReset(backendNotice?.localDate, hiddenMissedNoticeDate, activeMissedFailureDate);
    if (restore) restoreMissedNoticeDecision();
    if (clear) clearMissedScheduleFailure();
  }, [activeMissedFailureDate, backendNotice, clearMissedScheduleFailure, hiddenMissedNoticeDate, restoreMissedNoticeDecision]);

  return {
    decisionNotice,
    failureNotice,
    isResolving,
    actionMessage,
    runNow,
    ignore,
  };
}
