import { useCallback, useEffect, useMemo } from 'react';
import { downloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { useDownloadRuntimeStore } from '../../store/download-runtime-store/download-runtime-store';
import { connectDownloadRuntimeStore } from '../../store/download-runtime-store/download-runtime-store.helpers';
import { formatMissedScheduleActionMessage } from './missed-schedule-notice.helpers';
import type { MissedScheduleNoticeController } from './use-missed-schedule-notice.types';

/**
 * Shares the backend-owned missed schedule notice across Today, Downloads, and
 * the app-shell failure alert while keeping renderer-session UI state in one
 * place.
 */
export function useMissedScheduleNotice(
  source: DownloadRuntimeSource = downloadRuntimeSource,
): MissedScheduleNoticeController {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const scheduleConfig = useDownloadRuntimeStore((state) => state.scheduleConfig);
  const refreshSchedule = useDownloadRuntimeStore((state) => state.refreshSchedule);
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

  // 5. Derived State (useMemo)
  const backendNotice = scheduleConfig.missedNotice;
  const decisionNotice = useMemo(() => {
    if (backendNotice === undefined || hiddenMissedNoticeDate === backendNotice.localDate) {
      return undefined;
    }

    return backendNotice;
  }, [backendNotice, hiddenMissedNoticeDate]);

  const failureNotice = useMemo(() => {
    if (backendNotice === undefined || activeMissedFailureDate !== backendNotice.localDate) {
      return undefined;
    }

    return backendNotice;
  }, [activeMissedFailureDate, backendNotice]);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => refreshSchedule(source), [refreshSchedule, source]);

  const runNow = useCallback(
    async (localDate: string) => {
      setMissedNoticeResolving(true);
      setMissedNoticeActionMessage(undefined);
      hideMissedNoticeDecision(localDate);

      try {
        const result = await source.runMissedScheduleNow(localDate);
        const message = formatMissedScheduleActionMessage(result);

        if (message !== undefined) {
          setMissedNoticeActionMessage(message);
        }

        if (result.kind === 'settled') {
          clearMissedScheduleFailure();
          await refresh();
          return;
        }

        restoreMissedNoticeDecision();

        if (result.kind === 'unresolved_terminal') {
          showMissedScheduleFailure(localDate);
          await refresh();
          return;
        }

        if (result.kind === 'already_resolved' || result.kind === 'not_available') {
          await refresh();
        }
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
      setMissedNoticeActionMessage,
      setMissedNoticeResolving,
      showMissedScheduleFailure,
      source,
    ],
  );

  const ignore = useCallback(
    async (localDate: string) => {
      setMissedNoticeResolving(true);
      setMissedNoticeActionMessage(undefined);

      try {
        const result = await source.ignoreMissedSchedule(localDate);
        const message = formatMissedScheduleActionMessage(result);

        if (message !== undefined) {
          setMissedNoticeActionMessage(message);
        }

        if (result.kind === 'settled') {
          clearMissedScheduleFailure();
          await refresh();
          return;
        }

        if (result.kind === 'already_resolved' || result.kind === 'not_available') {
          await refresh();
        }
      } catch (error) {
        setMissedNoticeActionMessage(error instanceof Error ? error.message : 'Failed to resolve the missed schedule notice.');
      } finally {
        setMissedNoticeResolving(false);
      }
    },
    [clearMissedScheduleFailure, refresh, setMissedNoticeActionMessage, setMissedNoticeResolving, source],
  );

  // 7. Effects
  useEffect(() => {
    connectDownloadRuntimeStore(source);
  }, [source]);

  useEffect(() => {
    if (backendNotice === undefined) {
      restoreMissedNoticeDecision();
      clearMissedScheduleFailure();
      return;
    }

    if (hiddenMissedNoticeDate !== undefined && hiddenMissedNoticeDate !== backendNotice.localDate) {
      restoreMissedNoticeDecision();
    }

    if (activeMissedFailureDate !== undefined && activeMissedFailureDate !== backendNotice.localDate) {
      clearMissedScheduleFailure();
    }
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
