import type { AppNotificationAction } from '../../../../shared/contracts/app-notification.types';

/**
 * The visual variant HeroUI's toast primitives accept, mapped from
 * `AppNotificationSeverity` via `SEVERITY_TO_VARIANT`
 * (`notification-resolver.constants.ts`).
 */
export type AppToastVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger';

/**
 * Content payload carried by the app-owned `ToastQueue` (`app-toast-queue.ts`).
 * Unlike HeroUI's own `ToastContentValue`, `actions` is a full ordered list --
 * `renderAppToastContent` renders every one of them, never truncating to a
 * single `actionProps` slot (Bug B fix, design.md §3 Decision F). `recordId`
 * carries the notification's persisted Center record id, when one exists --
 * `renderAppToastContent` uses it to add a "View details" action (Task-
 * Planning Note C; notifications delta spec, "The persistedId enables
 * opening the matching Center record").
 */
export interface AppToastPayload {
  readonly title: string;
  readonly description?: string;
  readonly variant?: AppToastVariant;
  readonly actions?: readonly AppNotificationAction[];
  readonly recordId?: number;
}
