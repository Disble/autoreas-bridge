import { Typography } from '@heroui/react';
import { NotificationCenterPanel } from '../../features/notifications/ui/NotificationCenterPanel/NotificationCenterPanel';

/**
 * NotificationsRoute mounts the notification center panel as its own routed
 * surface, with the page header the "page header equals nav label"
 * convention every other routed page follows.
 */
export function NotificationsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1">Notifications</Typography>
        <Typography color="muted" type="body-sm">
          Every notification the bridge has recorded, unread first
        </Typography>
      </header>
      <NotificationCenterPanel />
    </div>
  );
}
