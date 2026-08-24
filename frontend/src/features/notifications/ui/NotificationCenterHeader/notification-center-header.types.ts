/**
 * Props for the dumb `NotificationCenterHeader` render (CLAUDE.md frontend
 * constraint #1: no hooks, no business logic). The unread count is read from
 * the shared notification store by the caller, never fetched here.
 */
export interface NotificationCenterHeaderProps {
  /** How many records are currently unread, as the shared store last reported. */
  readonly unreadCount: number;
  /** Marks every unread record the master list currently holds as read. */
  readonly onMarkAllRead: () => void;
  /** Whether there is anything left to mark; the action is disabled when there is not. */
  readonly canMarkAllRead: boolean;
}
