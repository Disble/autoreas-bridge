import { ToastProvider } from '@heroui/react';
import { renderAppToastContent } from './app-notification.helpers';
import { appToastQueue } from './app-toast-queue';
import { useAppToastController } from './use-app-toast-controller';
import { useBackendEventResolver } from './use-backend-event-resolver';
import { useMissedScheduleResolver } from './use-missed-schedule-resolver';

/**
 * Hosts every app notification through a single HeroUI `ToastProvider`
 * backed by the app-owned `appToastQueue` (design.md §3 Decision F), so a
 * toast renders every one of its actions instead of truncating to one
 * (Bug B). Resolver hooks drive `push`/`remove`; `useAppToastController`
 * owns the toast-id ledger (Decision H) -- this component stays dumb UI
 * (CLAUDE.md constraint #1).
 */
export function NotificationToasts() {
  const { push, remove } = useAppToastController();

  useBackendEventResolver(push, remove);
  useMissedScheduleResolver(push, remove);

  return (
    <ToastProvider placement="top end" queue={appToastQueue}>
      {renderAppToastContent}
    </ToastProvider>
  );
}
