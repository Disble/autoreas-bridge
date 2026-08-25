import type { NotificationNavigationListenerProps } from './notification-navigation.types';
import { useNotificationNavigation } from './use-notification-navigation';

/**
 * Renders nothing and exists only to hold `useNotificationNavigation` inside
 * router context, so a pressed `navigation.open` token actually moves the app.
 *
 * It is a component rather than a hook call in the shell because `AppLayout`
 * and everything under `app/**` is composition-only (CLAUDE.md frontend
 * constraint #4): the shell may mount a thing, never own an effect. That is
 * the same shape `NotificationToasts` uses for the toast host, reached through
 * the same one-line re-export seam in `app/`.
 */
export function NotificationNavigationListener({ source }: Readonly<NotificationNavigationListenerProps>) {
  useNotificationNavigation(source);

  return null;
}
