import { Button } from '@heroui/react';
import { NOTIFICATION_DETAIL_ROW_REFUSAL_MESSAGE_TESTID } from './notification-detail.constants';
import type { NotificationDetailActionButtonProps } from './notification-detail.types';
import { useNotificationAction } from './use-notification-action';

/**
 * One action button, driven by `useNotificationAction` against the real
 * `ExecuteNotificationAction` binding. Shared by both levels the record
 * carries actions at (`Intents.dc.html`): a row's own action, and the
 * footer's whole-notification action. The token shape is identical either
 * way — a row's action is not a special case — so the button is too, and
 * only `variant` differs, because the artboard fills the footer's leading
 * action and leaves a row's outlined.
 *
 * `source` is forwarded straight through: `useNotificationAction` falls back
 * to the runtime-backed singleton when it is `undefined`, so an omitted prop
 * is the production wiring rather than a missing one.
 */
export function NotificationDetailActionButton({ action, notificationId, source, variant }: Readonly<NotificationDetailActionButtonProps>) {
  const { isDisabled, press, refusalMessage } = useNotificationAction(notificationId, action, source);

  return (
    <div className="flex flex-col gap-0.5">
      <Button isDisabled={isDisabled} onPress={press} size="sm" variant={variant}>
        {action.label}
      </Button>
      {/* refusalMessage is only ever set while status === 'refused' (useNotificationAction's own invariant), so checking it alone is equivalent to the compound check and covers the one case that actually differs: a refused press whose server result omitted its reason. */}
      {refusalMessage !== undefined ? (
        <span className="text-[11px] text-danger" data-testid={NOTIFICATION_DETAIL_ROW_REFUSAL_MESSAGE_TESTID}>
          {refusalMessage}
        </span>
      ) : null}
    </div>
  );
}
