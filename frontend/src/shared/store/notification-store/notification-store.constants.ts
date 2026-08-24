import { createStore } from 'zustand/vanilla';
import type { NotificationStoreState } from './notification-store.types';

/**
 * Vanilla backing store for the shared notification read-model. It lives in
 * the constants file rather than beside its helpers because
 * `dharness/role-file-shape` reserves `.helpers` for functions -- the same
 * reason `DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE` sits in its own constants
 * file.
 */
export const notificationStore = createStore<NotificationStoreState>()(() => ({
  unreadCount: 0,
}));
