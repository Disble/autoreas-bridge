import { Button, Typography } from '@heroui/react';
import {
  NOTIFICATION_CENTER_HEADER_MARK_ALL_LABEL,
  NOTIFICATION_CENTER_HEADER_TITLE,
} from './notification-center-header.constants';
import { formatNotificationHeaderSubtitle } from './notification-center-header.helpers';
import type { NotificationCenterHeaderProps } from './notification-center-header.types';

/**
 * The notification screen's header, as the Main artboard draws it: the page
 * title, a subtitle carrying the live unread count, and "Mark all as read"
 * opposite them.
 *
 * It lives with the panel rather than in the route because its action is not
 * independent of the list: marking read has to refetch the very rows the
 * table is showing, and a header mounted outside the panel could not reach
 * them (`app/**` is composition-only, CLAUDE.md frontend constraint #4).
 */
export function NotificationCenterHeader({ canMarkAllRead, onMarkAllRead, unreadCount }: Readonly<NotificationCenterHeaderProps>) {
  return (
    <header className="flex flex-row flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <Typography type="h1">{NOTIFICATION_CENTER_HEADER_TITLE}</Typography>
        <Typography color="muted" type="body-sm">
          {formatNotificationHeaderSubtitle(unreadCount)}
        </Typography>
      </div>
      <Button isDisabled={!canMarkAllRead} onPress={onMarkAllRead} variant="secondary">
        {NOTIFICATION_CENTER_HEADER_MARK_ALL_LABEL}
      </Button>
    </header>
  );
}
