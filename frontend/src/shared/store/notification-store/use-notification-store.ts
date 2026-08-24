import { useStore } from 'zustand';
import { notificationStore } from './notification-store.constants';
import type { NotificationStoreState } from './notification-store.types';

/** Reads and subscribes to the notification store, optionally through a selector. */
export function useNotificationStore<T = NotificationStoreState>(
  selector: (state: NotificationStoreState) => T = ((state: NotificationStoreState) => state as T),
): T {
  return useStore(notificationStore, selector);
}
