import { NotificationCenterPanel } from '../../features/notifications/ui/NotificationCenterPanel/NotificationCenterPanel';

/**
 * NotificationsRoute mounts the notification center panel as its own routed
 * surface. The page header lives inside the panel rather than here: its
 * "Mark all as read" acts on the rows the master list is holding and
 * refetches them afterwards, which this composition-only layer must not do
 * (CLAUDE.md frontend constraint #4).
 */
export function NotificationsRoute() {
  return <NotificationCenterPanel />;
}
