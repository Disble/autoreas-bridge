import { Button, Chip } from '@heroui/react';
import { PageHeader } from '../../../../shared/ui/PageHeader/PageHeader';
import {
  NOTIFICATION_CENTER_HEADER_MARK_ALL_LABEL,
  NOTIFICATION_CENTER_HEADER_TITLE,
} from './notification-center-header.constants';
import { formatUnreadChipLabel } from './notification-center-header.helpers';
import type { NotificationCenterHeaderProps } from './notification-center-header.types';

/**
 * The notification screen's header: the page title with the live unread count
 * as a chip beside it, and "Mark all as read" opposite them.
 *
 * It lives with the panel rather than in the route because its action is not
 * independent of the list: marking read has to refetch the very rows the
 * table is showing, and a header mounted outside the panel could not reach
 * them (`app/**` is composition-only, CLAUDE.md frontend constraint #4).
 */
export function NotificationCenterHeader({ canMarkAllRead, onMarkAllRead, unreadCount }: Readonly<NotificationCenterHeaderProps>) {
  const unreadLabel = formatUnreadChipLabel(unreadCount);
  return (
    <PageHeader
      actions={
        <Button isDisabled={!canMarkAllRead} onPress={onMarkAllRead} variant="secondary">
          {NOTIFICATION_CENTER_HEADER_MARK_ALL_LABEL}
        </Button>
      }
      adornment={unreadLabel === null ? null : <Chip color="accent" size="sm" variant="soft">{unreadLabel}</Chip>}
      title={NOTIFICATION_CENTER_HEADER_TITLE}
    />
  );
}
