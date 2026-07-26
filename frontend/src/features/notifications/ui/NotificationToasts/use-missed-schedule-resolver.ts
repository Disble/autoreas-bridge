import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { useMissedScheduleNotice } from '../../../../shared/hooks/use-missed-schedule-notice';
import { formatMissedScheduleDueLabel } from '../../../../shared/hooks/use-missed-schedule-notice/missed-schedule-notice.helpers';
import { MISSED_DECISION_TOAST_ID, MISSED_FAILURE_TOAST_ID } from './notification-resolver.constants';

/**
 * Drives missed schedule decision and failure toasts from the shared
 * `useMissedScheduleNotice` controller state via the pipeline callbacks.
 */
export function useMissedScheduleResolver(
  push: (notification: AppNotification) => void,
  remove: (id: string) => void,
): void {
  const navigate = useNavigate();
  const notice = useMissedScheduleNotice();
  const noticeRef = useRef(notice);
  noticeRef.current = notice;

  const pushRef = useRef(push);
  pushRef.current = push;
  const removeRef = useRef(remove);
  removeRef.current = remove;

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
        persistedId: MISSED_DECISION_TOAST_ID,
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
        persistedId: MISSED_FAILURE_TOAST_ID,
      });
    } else {
      removeRef.current(MISSED_FAILURE_TOAST_ID);
    }
  }, [notice.failureNotice, navigate]);

  return undefined;
}
