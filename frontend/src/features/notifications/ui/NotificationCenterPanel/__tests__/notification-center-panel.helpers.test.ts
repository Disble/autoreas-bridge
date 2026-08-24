import { describe, expect, it } from 'vitest';
import { toNotificationEmptyStateConditions } from '../notification-center-panel.helpers';

describe('toNotificationEmptyStateConditions', () => {
  it('marks the service available when the page is not degraded', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 3,
      view: 'active',
      unreadOnly: false,
      degraded: false,
      hasSearch: false,
    });

    expect(conditions).toEqual({
      totalEverRecorded: 3,
      view: 'active',
      unreadOnly: false,
      hasFilters: false,
      serviceAvailable: true,
    });
  });

  it('marks the service unavailable when the page comes back degraded', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 0,
      view: 'archived',
      unreadOnly: true,
      degraded: true,
      hasSearch: false,
    });

    expect(conditions.serviceAvailable).toBe(false);
  });

  it('reports hasFilters true once a non-empty search is applied (Slice 3b)', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'active',
      unreadOnly: false,
      degraded: false,
      hasSearch: true,
    });

    expect(conditions.hasFilters).toBe(true);
  });

  it('reports hasFilters false when no search is applied', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'active',
      unreadOnly: false,
      degraded: false,
      hasSearch: false,
    });

    expect(conditions.hasFilters).toBe(false);
  });
});
