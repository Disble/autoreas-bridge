import { describe, expect, it } from 'vitest';
import { toNotificationEmptyStateConditions } from '../notification-center-panel.helpers';

describe('toNotificationEmptyStateConditions', () => {
  it('marks the service available when the page is not degraded', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 3,
      view: 'active',
      unreadOnly: false,
      degraded: false,
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
    });

    expect(conditions.serviceAvailable).toBe(false);
  });

  it('never reports filters, since no search or source/level filters are wired until Slice 3b', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'active',
      unreadOnly: false,
      degraded: false,
    });

    expect(conditions.hasFilters).toBe(false);
  });
});
