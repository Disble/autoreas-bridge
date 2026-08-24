import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { useMissedScheduleNotice } from '../../../../shared/hooks/use-missed-schedule-notice/use-missed-schedule-notice';
import { formatMissedScheduleDueLabel } from '../../../../shared/hooks/use-missed-schedule-notice/missed-schedule-notice.helpers';
import { MISSED_DECISION_TOAST_ID, MISSED_FAILURE_TOAST_ID } from './notification-resolver.constants';

/**
 * Drives missed schedule decision and failure toasts from the shared
 * `useMissedScheduleNotice` controller state via the pipeline callbacks.
 */
export function useMissedScheduleResolver(
  push: (notification: AppNotification) => void,
  remove: (key: string | number) => void,
): void {
  const navigate = useNavigate();
  const notice = useMissedScheduleNotice();
  const noticeRef = useRef(notice);
  const pushRef = useRef(push);
  const removeRef = useRef(remove);

  // Refreshed in an effect rather than during render: React may discard a
  // render pass, and a ref written during one that never commits leaves the
  // effects below acting on a stale notice or callback.
  useEffect(() => {
    noticeRef.current = notice;
    pushRef.current = push;
    removeRef.current = remove;
  });

  useEffect(() => {
    const { decisionNotice, runNow, ignore } = noticeRef.current;

    if (decisionNotice) {
      pushRef.current({
        severity: 'warning',
        title: 'Missed selected day',
        description: formatMissedScheduleDueLabel(decisionNotice),
        actions: [
          {
            label: 'Run now',
            onPress: () => {
              void runNow(decisionNotice.localDate);
            },
            variant: 'primary',
          },
          {
            label: 'Ignore',
            onPress: () => {
              void ignore(decisionNotice.localDate);
            },
          },
        ],
        persistent: true,
        dedupeKey: MISSED_DECISION_TOAST_ID,
      });
    } else {
      removeRef.current(MISSED_DECISION_TOAST_ID);
    }
  }, [notice.decisionNotice]);

  useEffect(() => {
    const { failureNotice, ignore } = noticeRef.current;

    if (failureNotice) {
      pushRef.current({
        severity: 'error',
        title: 'Missed schedule failed',
        description: `Last attempt for ${failureNotice.localDate}: ${failureNotice.attemptStatus ?? 'failed'}`,
        actions: [
          {
            label: 'Open Downloads',
            onPress: () => {
              void navigate('/downloads');
            },
            variant: 'primary',
          },
          {
            label: 'Ignore this date',
            onPress: () => {
              void ignore(failureNotice.localDate);
            },
          },
        ],
        persistent: true,
        dedupeKey: MISSED_FAILURE_TOAST_ID,
      });
    } else {
      removeRef.current(MISSED_FAILURE_TOAST_ID);
    }
  }, [notice.failureNotice, navigate]);

  return undefined;
}
