/**
 * The five canonical empty-state renderings the notification-center spec
 * names (design.md §9.3), plus `unavailable` for a degraded/unreachable
 * store -- a real behavior the design table's condition 5 requires, added
 * beyond the spec's literally-named five under strict TDD (see the
 * `__tests__` file's deviation note).
 */
export type NotificationEmptyStateId =
  | 'never-recorded'
  | 'filters-empty'
  | 'active-all-archived'
  | 'unread-none'
  | 'archived-empty'
  | 'unavailable';

/** Which archive view is currently selected. */
export type NotificationEmptyStateView = 'active' | 'archived';

/**
 * Everything `selectNotificationEmptyState` needs to distinguish the six
 * renderings. Mirrors the exact 5-tuple task 3a.2.1 names:
 * `(totalEverRecorded, view, unreadOnly, hasFilters, serviceAvailable)`.
 */
export interface NotificationEmptyStateConditions {
  readonly totalEverRecorded: number;
  readonly view: NotificationEmptyStateView;
  readonly unreadOnly: boolean;
  readonly hasFilters: boolean;
  readonly serviceAvailable: boolean;
}

/** Props for the dumb `NotificationEmptyState` render. */
export type NotificationEmptyStateProps = NotificationEmptyStateConditions;
