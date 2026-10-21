/**
 * Labels the title-row unread chip with the live count, or returns `null` to
 * hide it: the number is only worth a chip when there is one. The count comes
 * from the shared notification store -- the same value the nav rail badge
 * renders -- so the two can never disagree.
 */
export function formatUnreadChipLabel(unreadCount: number): string | null {
  return unreadCount > 0 ? `${unreadCount} unread` : null;
}
