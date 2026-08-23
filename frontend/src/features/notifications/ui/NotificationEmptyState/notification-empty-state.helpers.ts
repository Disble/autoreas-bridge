import type { NotificationEmptyStateConditions, NotificationEmptyStateId } from './notification-empty-state.types';

/**
 * Selects which of the six empty-state renderings applies, given the
 * current list conditions (design.md §9.3, notification-center spec). Checks
 * run in priority order: an unreachable store overrides every count-derived
 * state, "never recorded" overrides a narrowing filter, and a filter
 * overrides the plain view-driven states.
 */
export function selectNotificationEmptyState(
  conditions: Readonly<NotificationEmptyStateConditions>,
): NotificationEmptyStateId {
  const { totalEverRecorded, view, unreadOnly, hasFilters, serviceAvailable } = conditions;

  if (!serviceAvailable) {
    return 'unavailable';
  }
  if (totalEverRecorded === 0) {
    return 'never-recorded';
  }
  if (hasFilters) {
    return 'filters-empty';
  }
  if (unreadOnly) {
    return 'unread-none';
  }
  if (view === 'archived') {
    return 'archived-empty';
  }
  return 'active-all-archived';
}
