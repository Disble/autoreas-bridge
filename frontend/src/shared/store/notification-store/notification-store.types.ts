/** Zustand state contract for the shared notification read-model. */
export type NotificationStoreState = {
  /**
   * How many records are currently unread, as last reported by the backend.
   * It lives here rather than inside the rail badge because two unrelated
   * surfaces move it: navigation renders it, and every notification-center
   * lifecycle mutation lowers it.
   */
  readonly unreadCount: number;
};
