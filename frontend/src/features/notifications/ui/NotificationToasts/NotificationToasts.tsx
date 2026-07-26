import { useCallback, useRef } from 'react';
import { toast, ToastProvider } from '@heroui/react';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { renderAppNotificationToast } from './app-notification.helpers';
import { useBackendEventResolver } from './use-backend-event-resolver';
import { useMissedScheduleResolver } from './use-missed-schedule-resolver';

/**
 * Hosts every app notification through a single HeroUI ToastProvider pipeline.
 * Resolver hooks drive push/remove; the controller owns the toast-id ledger
 * and renders everything.
 */
export function NotificationToasts() {
  const toastIdsRef = useRef<Map<string, string>>(new Map());

  const remove = useCallback((persistedId: string) => {
    const toastId = toastIdsRef.current.get(persistedId);
    if (toastId) {
      toast.close(toastId);
      toastIdsRef.current.delete(persistedId);
    }
  }, []);

  const push = useCallback(
    (notification: AppNotification) => {
      const { persistedId } = notification;
      if (persistedId && toastIdsRef.current.has(persistedId)) {
        return;
      }
      const toastId = renderAppNotificationToast(notification);
      if (persistedId) {
        toastIdsRef.current.set(persistedId, toastId);
      }
    },
    [],
  );

  useBackendEventResolver(push);
  useMissedScheduleResolver(push, remove);

  return <ToastProvider placement="top end" />;
}
