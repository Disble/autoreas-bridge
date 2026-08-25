import { useCallback, useMemo, useRef, useState } from 'react';
import type { NotificationAction } from '../../../../shared/contracts/notification-center.types';
import { createNotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { resolveRefusalMessage, resolveServerActionStatus } from './notification-detail.helpers';
import type { NotificationActionUIStatus, UseNotificationActionResult } from './notification-detail.types';

/** The optimistic local settlement a press enters before it resolves, layered over the action's server-known fields. */
interface LocalPressState {
  readonly reason: string;
  readonly status: 'executed' | 'pending' | 'refused';
}

/**
 * Drives one detail row's per-action button through the real, Slice-5-wired
 * `ExecuteNotificationAction` binding (`source.executeAction`, injectable so
 * tests can supply a fake -- mirrors `use-notification-detail-covers.ts`'s
 * own injectable-source pattern). A press disables the button optimistically
 * (`'pending'`), then settles to `'executed'` or `'refused'` once the
 * backend answers; an in-flight press is guarded by a ref rather than the
 * `isDisabled` state alone, since two synchronous presses in the same event
 * can both read the same stale `isDisabled` before React re-renders.
 */
export function useNotificationAction(
  notificationId: number,
  action: NotificationAction,
  source: NotificationCenterSource = createNotificationCenterSource(),
): UseNotificationActionResult {
  // 3. Refs
  const isPressInFlightRef = useRef(false);

  // 4. State
  const [localPress, setLocalPress] = useState<LocalPressState | null>(null);

  // 5. Derived state
  const serverStatus = useMemo(() => resolveServerActionStatus(action), [action]);
  const settledStatus: NotificationActionUIStatus = localPress?.status ?? serverStatus;
  // A repeatable action returns to idle once its press settles, so it can be
  // pressed again. This mirrors `center.Executor` exactly, including which
  // gate it widens: the Executor consults `Repeatable()` ONLY at the
  // already-executed check, so `'pending'` still disables an in-flight press
  // and `'refused'` still disables permanently. Applied here rather than in
  // `resolveServerActionStatus` because it has to cover both routes into
  // `'executed'` -- the optimistic local settlement AND the persisted
  // `executedAtMs` a re-read carries -- and the helper only sees the second.
  const status: NotificationActionUIStatus = settledStatus === 'executed' && action.repeatable === true ? 'idle' : settledStatus;
  const isDisabled = status !== 'idle';
  const refusalReason = localPress?.status === 'refused' ? localPress.reason : action.refusedReason;
  const refusalMessage = status === 'refused' ? resolveRefusalMessage(refusalReason) : undefined;

  // 6. Callbacks
  const press = useCallback(() => {
    if (isDisabled || isPressInFlightRef.current) {
      // Notification-actions spec: a refused action's button is permanently
      // disabled and is never retryable by pressing again; a press already
      // in flight must not fire the handler a second time either.
      return;
    }

    isPressInFlightRef.current = true;
    setLocalPress({ reason: '', status: 'pending' });
    void source.executeAction(notificationId, action.id).then((result) => {
      isPressInFlightRef.current = false;
      setLocalPress(result.executed ? { reason: '', status: 'executed' } : { reason: result.reason ?? '', status: 'refused' });
    });
  }, [action.id, isDisabled, notificationId, source]);

  return { isDisabled, press, refusalMessage, status };
}
