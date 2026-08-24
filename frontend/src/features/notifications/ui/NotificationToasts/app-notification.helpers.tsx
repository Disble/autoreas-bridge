import type { ReactElement } from 'react';
import { Toast, ToastActionButton, ToastCloseButton, ToastContent, ToastDescription, ToastTitle } from '@heroui/react';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { appToastQueue, resolveToastTimeoutMs } from './app-toast-queue';
import { SEVERITY_TO_VARIANT, VIEW_DETAILS_ACTION_LABEL } from './notification-resolver.constants';
import type { AppToastPayload } from './app-notification.types';

/**
 * A structural mirror of react-aria-components' `QueuedToast<AppToastPayload>`
 * -- kept local, naming only the fields `renderAppToastContent` and HeroUI's
 * `<Toast>` wrapper actually read (`content`, `key`), rather than importing
 * the type from `react-aria-components` directly. `@heroui/react` only
 * declares that package as a peer dependency, and this module already
 * depends on it solely through `@heroui/react`'s own public surface.
 */
export interface AppQueuedToast {
  readonly content: AppToastPayload;
  readonly key: string;
}

/**
 * Adds a notification to the app-owned toast queue (`appToastQueue`).
 * Carries EVERY action from `notification.actions` on the payload -- unlike
 * the old `toast.success/warning/danger/info(...)` calls this replaces,
 * which truncated to a single `actionProps` slot and silently dropped any
 * action after the first (Bug B, notifications delta spec). Rendering all
 * of them is `renderAppToastContent`'s job, wired as `NotificationToasts`'
 * `ToastProvider` children render function.
 */
export function renderAppNotificationToast(notification: AppNotification): string {
  const { severity, title, description, actions, persistent, recordId } = notification;

  return appToastQueue.add(
    {
      title,
      description,
      variant: SEVERITY_TO_VARIANT[severity],
      actions,
      recordId,
    },
    { timeout: resolveToastTimeoutMs(persistent) },
  );
}

/**
 * Closes a toast `renderAppNotificationToast` opened, on the SAME app-owned
 * queue it was added to.
 *
 * It lives here, beside the add, rather than in the controller that calls it,
 * because the two must never again drift onto different queues.
 * `appToastQueue` is an app-owned `ToastQueue` INSTANCE while `@heroui/react`
 * also exports a module-level `toast.*` singleton wrapping a DIFFERENT
 * instance of the same class -- each with its own key space, and each
 * silently ignoring a key belonging to the other. Closing an app-owned toast
 * through `toast.close` therefore looks completely correct and does nothing:
 * a persistent toast (timeout 0) then stays on screen for the rest of the
 * session, long after the notice it warns about has been settled.
 */
export function closeAppNotificationToast(toastId: string): void {
  appToastQueue.close(toastId);
}

/**
 * Navigates to the Notification Center scoped to one record (Task-Planning
 * Note C; notifications delta spec, "The persistedId enables opening the
 * matching Center record"). `renderAppToastContent` below is invoked as a
 * plain function -- by `ToastProvider` internally, and directly in tests --
 * never as a JSX-rendered component, so it cannot call `useNavigate()`
 * (Rules of Hooks). `HashRouter` (`src/main.tsx`) reacts to
 * `window.location.hash` directly, so setting it here is a real navigation,
 * not a workaround.
 */
function navigateToNotificationRecord(recordId: number): void {
  window.location.hash = `/notifications?recordId=${recordId}`;
}

/**
 * Renders one queued app toast's full content, including every action, plus
 * a "View details" action when the toast carries a persisted `recordId`.
 * Passed as `NotificationToasts`' `ToastProvider` children render function
 * (design.md §3 Decision F) -- HeroUI's own default renderer only supports a
 * single `actionProps` slot (`ToastContentValue.actionProps` is singular),
 * which is exactly the shape that produced Bug B.
 */
export function renderAppToastContent({ toast }: Readonly<{ toast: AppQueuedToast }>): ReactElement {
  const { title, description, actions, variant, recordId } = toast.content;

  return (
    <Toast<AppToastPayload> toast={toast} variant={variant}>
      <ToastContent>
        <ToastTitle>{title}</ToastTitle>
        {description ? <ToastDescription>{description}</ToastDescription> : null}
      </ToastContent>
      {(actions ?? []).map((action) => (
        <ToastActionButton key={action.label} variant={action.variant} onPress={action.onPress}>
          {action.label}
        </ToastActionButton>
      ))}
      {recordId === undefined ? null : (
        <ToastActionButton onPress={() => navigateToNotificationRecord(recordId)}>{VIEW_DETAILS_ACTION_LABEL}</ToastActionButton>
      )}
      <ToastCloseButton />
    </Toast>
  );
}
