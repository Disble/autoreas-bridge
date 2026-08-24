import { describe, expect, it } from 'vitest';
import { toNotificationEmptyStateConditions, toNotificationRecordId } from '../notification-center-panel.helpers';

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

describe('toNotificationRecordId', () => {
  it('resolves a numeric row key straight through', () => {
    expect(toNotificationRecordId(7)).toBe(7);
  });

  it('resolves a numeric-string row key, since React Aria widens every key to string | number', () => {
    expect(toNotificationRecordId('7')).toBe(7);
  });

  it('resolves a key that names no record at all to null, rather than to NaN', () => {
    expect(toNotificationRecordId('load-more-sentinel')).toBeNull();
  });

  it('resolves a fractional key to null, since a record id is always a whole number', () => {
    expect(toNotificationRecordId('7.5')).toBeNull();
  });

  it('resolves zero to null, since record ids are the store\u2019s own autoincrement keys and start above it', () => {
    expect(toNotificationRecordId(0)).toBeNull();
  });

  it('resolves a negative key to null', () => {
    expect(toNotificationRecordId(-7)).toBeNull();
  });
});
