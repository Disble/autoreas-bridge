import {
  NOTIFICATION_CENTER_HEADER_NONE_UNREAD,
  NOTIFICATION_CENTER_HEADER_SEPARATOR,
  NOTIFICATION_CENTER_HEADER_STANDING_LINE,
} from './notification-center-header.constants';

/**
 * Formats the count half of the subtitle. Zero reads as "No unread" rather
 * than "0 unread": the number is only interesting when there is one.
 */
function formatUnreadCountLabel(unreadCount: number): string {
  if (unreadCount <= 0) {
    return NOTIFICATION_CENTER_HEADER_NONE_UNREAD;
  }
  return `${unreadCount} unread`;
}

/**
 * Builds the page subtitle: the live unread count, then what this screen is
 * for. The count comes from the shared notification store -- the same value
 * the nav rail badge renders -- so the two can never disagree.
 */
export function formatNotificationHeaderSubtitle(unreadCount: number): string {
  return `${formatUnreadCountLabel(unreadCount)}${NOTIFICATION_CENTER_HEADER_SEPARATOR}${NOTIFICATION_CENTER_HEADER_STANDING_LINE}`;
}
