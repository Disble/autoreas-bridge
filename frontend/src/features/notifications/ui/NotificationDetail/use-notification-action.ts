import { useCallback, useMemo, useState } from 'react';
import type { NotificationAction } from '../../../../shared/contracts/notification-center.types';
import { resolveRefusalMessage, resolveServerActionStatus } from './notification-detail.helpers';
import type { NotificationActionUIStatus, UseNotificationActionResult } from './notification-detail.types';

/** The optimistic local settlement a press enters before it resolves, layered over the action's server-known fields. */
interface LocalPressState {
  readonly reason: string;
  readonly status: 'pending' | 'refused';
}

/**
 * Drives one detail row's per-action button. Slice 5 is the slice that
 * registers real intents behind a live `ExecuteNotificationAction` Wails
 * binding (Task-Planning Note A) -- that binding does not exist yet, so
 * pressing here is DELIBERATELY inert: the button disables optimistically
 * on press, then settles on `intent_unregistered`, the exact refusal an
 * empty `IntentRegistry` produces server-side today (notification-actions
 * spec, "An empty registry refuses every action, without crashing"),
 * without this hook ever calling a backend. Slice 5 only needs to replace
 * the body of the settle step below with the real binding call; the
 * optimistic-disable / permanently-disabled-once-settled contract this hook
 * exposes does not change.
 */
export function useNotificationAction(action: NotificationAction): UseNotificationActionResult {
  // 2. State
  const [localPress, setLocalPress] = useState<LocalPressState | null>(null);

  // 5. Derived state
  const serverStatus = useMemo(() => resolveServerActionStatus(action), [action]);
  const status: NotificationActionUIStatus = localPress?.status ?? serverStatus;
  const isDisabled = status !== 'idle';
  const refusalReason = localPress?.status === 'refused' ? localPress.reason : action.refusedReason;
  const refusalMessage = status === 'refused' ? resolveRefusalMessage(refusalReason) : undefined;

  // 6. Callbacks
  const press = useCallback(() => {
    if (isDisabled) {
      // Notification-actions spec: a refused action's button is permanently
      // disabled and is never retryable by pressing again.
      return;
    }

    setLocalPress({ reason: '', status: 'pending' });
    void Promise.resolve().then(() => {
      setLocalPress({ reason: 'intent_unregistered', status: 'refused' });
    });
  }, [isDisabled]);

  return { isDisabled, press, refusalMessage, status };
}
