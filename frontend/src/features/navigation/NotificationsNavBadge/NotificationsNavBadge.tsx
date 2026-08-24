import { Chip } from '@heroui/react';
import type { NotificationsNavBadgeProps } from './notifications-nav-badge.types';
import { useNotificationsNavBadge } from './use-notifications-nav-badge';

/**
 * Renders the current unread notification count next to the Notifications
 * nav item, and renders nothing while nothing is unread.
 */
export function NotificationsNavBadge({ centerSource, pushSource }: Readonly<NotificationsNavBadgeProps>) {
  const unreadCount = useNotificationsNavBadge(centerSource, pushSource);

  if (unreadCount === 0) {
    return null;
  }

  return (
    <Chip color="accent" size="sm" variant="soft">
      <Chip.Label>{unreadCount}</Chip.Label>
    </Chip>
  );
}
