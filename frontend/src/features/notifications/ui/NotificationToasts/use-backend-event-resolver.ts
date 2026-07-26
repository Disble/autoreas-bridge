import { useEffect, useRef } from 'react';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { notificationSource } from '../../../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import { LEVEL_TO_SEVERITY } from './notification-resolver.constants';

/**
 * Subscribes to the backend `notification.push` event stream and pushes
 * ephemeral AppNotification toast(s) for each event received.
 */
export function useBackendEventResolver(
  push: (notification: AppNotification) => void,
  source: NotificationSource = notificationSource,
): void {
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    return source.subscribe((notification) => {
      pushRef.current({
        severity: LEVEL_TO_SEVERITY[notification.Level] ?? 'info',
        title: notification.Title,
        description: notification.Body || undefined,
        persistent: false,
      });
    });
  }, [source]);

  return undefined;
}
