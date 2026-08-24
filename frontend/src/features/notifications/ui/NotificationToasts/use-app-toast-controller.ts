import { useCallback, useRef } from 'react';
import { toast } from '@heroui/react';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { renderAppNotificationToast } from './app-notification.helpers';

/** What `useAppToastController` exposes to `NotificationToasts`. */
export interface AppToastController {
  /** Pushes a notification as a toast, deduping against its `dedupeKey`/`recordId` when set. */
  readonly push: (notification: AppNotification) => void;
  /** Closes and forgets a tracked toast, addressed by either its `dedupeKey` (string) or `recordId` (number). */
  readonly remove: (key: string | number) => void;
}

/**
 * Owns the toast-id ledger backing `push`/`remove` (design.md §3 Decision H
 * -- extracted out of `NotificationToasts.tsx`, which stays dumb UI per
 * CLAUDE.md constraint #1).
 *
 * Two independent ledgers are kept because a toast can be addressed by
 * either key: `use-missed-schedule-resolver.ts` pushes/removes by a
 * client-owned `dedupeKey` string, while `use-backend-event-resolver.ts`
 * closes a live toast by its backend `recordId` number when a
 * `notification.archived` event arrives (Decision G). A push carrying both
 * keys is tracked in both ledgers under the same toast id.
 *
 * A push whose key is already tracked is a no-op -- without this, a notice
 * re-rendering on every tick (e.g. the missed-schedule decision notice)
 * would re-open its own persistent toast on every render.
 */
export function useAppToastController(): AppToastController {
  // 1. Refs
  const dedupeKeyToToastIdRef = useRef<Map<string, string>>(new Map());
  const recordIdToToastIdRef = useRef<Map<number, string>>(new Map());

  // 6. Callbacks
  const remove = useCallback((key: string | number) => {
    if (typeof key === 'number') {
      const toastId = recordIdToToastIdRef.current.get(key);
      if (!toastId) {
        return;
      }
      toast.close(toastId);
      recordIdToToastIdRef.current.delete(key);
      return;
    }

    const toastId = dedupeKeyToToastIdRef.current.get(key);
    if (!toastId) {
      return;
    }
    toast.close(toastId);
    dedupeKeyToToastIdRef.current.delete(key);
  }, []);

  const push = useCallback((notification: AppNotification) => {
    const { dedupeKey, recordId } = notification;
    if (dedupeKey && dedupeKeyToToastIdRef.current.has(dedupeKey)) {
      return;
    }
    if (recordId !== undefined && recordIdToToastIdRef.current.has(recordId)) {
      return;
    }

    const toastId = renderAppNotificationToast(notification);
    if (dedupeKey) {
      dedupeKeyToToastIdRef.current.set(dedupeKey, toastId);
    }
    if (recordId !== undefined) {
      recordIdToToastIdRef.current.set(recordId, toastId);
    }
  }, []);

  return { push, remove };
}
