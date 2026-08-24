import { ToastQueue } from '@heroui/react';
import { DEFAULT_TOAST_TIMEOUT_MS } from './notification-resolver.constants';
import type { AppToastPayload } from './app-notification.types';

/**
 * The single app-owned toast queue backing every notification toast.
 * Mounted into `NotificationToasts`' `ToastProvider` (design.md §3 Decision
 * F) so the queue's own payload type (`AppToastPayload`) can carry every
 * action a notification has, not just one -- HeroUI's module-level `toast.*`
 * singleton is fixed to `ToastContentValue`, whose `actionProps` is
 * singular.
 */
export const appToastQueue = new ToastQueue<AppToastPayload>();

/**
 * Resolves the `timeout` option `appToastQueue.add()` receives from a
 * notification's `persistent` flag.
 *
 * MUST always return an explicit number, never omit the key. Verified
 * against the installed `@heroui/react` 3.2.4 dist source
 * (`components/toast/toast-queue.js`): the exported `ToastQueue` class --
 * the SAME class both the module singleton and this app-owned instance are
 * built from -- resolves an *omitted* `timeout` to `DEFAULT_TOAST_TIMEOUT`
 * (4000ms) before ever reaching the underlying react-aria-components queue.
 * The "omit timeout = persistent" convention design.md §3 Decision F flagged
 * as a bounded unknown belongs to that raw react-aria-components queue,
 * which this app never talks to directly -- so it never actually applies
 * here. Omitting `timeout` for a persistent notification would therefore
 * silently make it auto-dismiss after 4 seconds; only an explicit `0` keeps
 * it open, matching the current `toast.*(title, { timeout: 0 })` behavior
 * this function replaces.
 */
export function resolveToastTimeoutMs(persistent: boolean | undefined): number {
  return persistent ? 0 : DEFAULT_TOAST_TIMEOUT_MS;
}
