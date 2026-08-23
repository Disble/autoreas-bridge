import { describe, expect, it } from 'vitest';
import { selectNotificationEmptyState } from '../notification-empty-state.helpers';

/**
 * Pure-helper table test over the `(totalEverRecorded, view, unreadOnly,
 * hasFilters, serviceAvailable)` conditions (task 3a.2.1), asserting distinct
 * state ids as literals. Notification-center spec scenarios: "Nothing has
 * ever been recorded," "A search or filter combination matches nothing,"
 * "Every active record has been archived," "Unread filter with nothing
 * unread," "Archived view with nothing archived."
 *
 * **Added beyond the task's literally-named 5**: a `serviceAvailable: false`
 * case. Design.md §9.3's table names a 6th condition ("the notification
 * service is unavailable") with no matching spec scenario, and the helper's
 * signature already threads `serviceAvailable` through -- leaving it
 * unexercised would ship an untested parameter. It is checked FIRST
 * (highest priority) since an unreachable store makes every other count
 * untrustworthy.
 */
describe('selectNotificationEmptyState', () => {
  it('selects "never-recorded" when nothing has ever been recorded', () => {
    expect(
      selectNotificationEmptyState({
        totalEverRecorded: 0,
        view: 'active',
        unreadOnly: false,
        hasFilters: false,
        serviceAvailable: true,
      }),
    ).toBe('never-recorded');
  });

  it('selects "filters-empty" when a search or filter combination matches nothing', () => {
    expect(
      selectNotificationEmptyState({
        totalEverRecorded: 10,
        view: 'active',
        unreadOnly: false,
        hasFilters: true,
        serviceAvailable: true,
      }),
    ).toBe('filters-empty');
  });

  it('selects "active-all-archived" when every active record has been archived', () => {
    expect(
      selectNotificationEmptyState({
        totalEverRecorded: 10,
        view: 'active',
        unreadOnly: false,
        hasFilters: false,
        serviceAvailable: true,
      }),
    ).toBe('active-all-archived');
  });

  it('selects "unread-none" when the unread filter is applied and nothing is unread', () => {
    expect(
      selectNotificationEmptyState({
        totalEverRecorded: 10,
        view: 'active',
        unreadOnly: true,
        hasFilters: false,
        serviceAvailable: true,
      }),
    ).toBe('unread-none');
  });

  it('selects "archived-empty" when the archived view is selected and nothing has been archived', () => {
    expect(
      selectNotificationEmptyState({
        totalEverRecorded: 10,
        view: 'archived',
        unreadOnly: false,
        hasFilters: false,
        serviceAvailable: true,
      }),
    ).toBe('archived-empty');
  });

  it('selects "unavailable" when the notification service cannot be reached, overriding every other condition', () => {
    expect(
      selectNotificationEmptyState({
        totalEverRecorded: 0,
        view: 'active',
        unreadOnly: true,
        hasFilters: true,
        serviceAvailable: false,
      }),
    ).toBe('unavailable');
  });
});
