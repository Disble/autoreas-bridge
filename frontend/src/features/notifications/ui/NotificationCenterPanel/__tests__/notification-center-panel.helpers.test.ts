import { describe, expect, it } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import {
  filterNotificationRowsForView,
  toNotificationCenterQuery,
  toNotificationEmptyStateConditions,
  toNotificationRecordId,
  toUnreadNotificationIds,
} from '../notification-center-panel.helpers';

/**
 * Builds a row carrying only the id and read state these helpers read.
 * @param id The record id.
 * @param readAtMs When the record was read, or `undefined` while it is unread.
 * @returns One `NotificationRow`.
 */
function buildRow(id: number, readAtMs?: number): NotificationRow {
  return { id, createdAtMs: 1_000 * id, title: `Row ${id}`, body: '', level: 'info', source: 'download', actionCount: 0, readAtMs };
}

describe('toNotificationCenterQuery', () => {
  it('asks the inbox for everything on the active tab', () => {
    expect(toNotificationCenterQuery('active')).toEqual({ view: 'active', unreadOnly: false });
  });

  it('narrows the inbox to unread records on the unread tab', () => {
    expect(toNotificationCenterQuery('unread')).toEqual({ view: 'active', unreadOnly: true });
  });

  it('asks the inbox for everything on the read tab, because the store has no read-only filter', () => {
    // "Read" is the complement of unread and the query cannot express it, so
    // it is narrowed after the page arrives -- see filterNotificationRowsForView.
    expect(toNotificationCenterQuery('read')).toEqual({ view: 'active', unreadOnly: false });
  });

  it('switches to the archive on the archived tab, without narrowing by read state', () => {
    expect(toNotificationCenterQuery('archived')).toEqual({ view: 'archived', unreadOnly: false });
  });
});

describe('filterNotificationRowsForView', () => {
  it('keeps only the records that have actually been read on the read tab', () => {
    const rows = [buildRow(1), buildRow(2, 1_700_000_000_000)];

    expect(filterNotificationRowsForView(rows, 'read').map((row) => row.id)).toEqual([2]);
  });

  it('reads a zero readAtMs as unread rather than as read at the epoch', () => {
    expect(filterNotificationRowsForView([buildRow(1, 0)], 'read')).toEqual([]);
  });

  it('hands every other tab its rows back by identity, so the backend filter stays authoritative', () => {
    const rows = [buildRow(1), buildRow(2, 1_700_000_000_000)];

    expect(filterNotificationRowsForView(rows, 'active')).toBe(rows);
    expect(filterNotificationRowsForView(rows, 'unread')).toBe(rows);
    expect(filterNotificationRowsForView(rows, 'archived')).toBe(rows);
  });
});

describe('toUnreadNotificationIds', () => {
  it('collects the ids of every record nobody has read yet', () => {
    expect(toUnreadNotificationIds([buildRow(1), buildRow(2, 1_700_000_000_000), buildRow(3)])).toEqual([1, 3]);
  });

  it('collects nothing when every loaded record is already read', () => {
    expect(toUnreadNotificationIds([buildRow(1, 1_700_000_000_000)])).toEqual([]);
  });
});

describe('toNotificationEmptyStateConditions', () => {
  it('marks the service available when the page is not degraded', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 3,
      view: 'active',
      degraded: false,
      hasSearch: false,
      hasFacetFilters: false,
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
      degraded: true,
      hasSearch: false,
      hasFacetFilters: false,
    });

    expect(conditions.serviceAvailable).toBe(false);
  });

  it('reports the unread tab as unread-only, which is what makes the "All caught up" rendering reachable', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'unread',
      degraded: false,
      hasSearch: false,
      hasFacetFilters: false,
    });

    expect(conditions.unreadOnly).toBe(true);
    // A narrowing filter outranks unreadOnly in the selection order, so the
    // unread tab must NOT report itself as one.
    expect(conditions.hasFilters).toBe(false);
  });

  it('reports the read tab as a narrowing filter, since nothing read is not "all archived"', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'read',
      degraded: false,
      hasSearch: false,
      hasFacetFilters: false,
    });

    expect(conditions.hasFilters).toBe(true);
  });

  it('reports hasFilters true once a non-empty search is applied (Slice 3b)', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'active',
      degraded: false,
      hasSearch: true,
      hasFacetFilters: false,
    });

    expect(conditions.hasFilters).toBe(true);
  });

  it('reports hasFilters true once a level or source dropdown narrows the query', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'active',
      degraded: false,
      hasSearch: false,
      hasFacetFilters: true,
    });

    expect(conditions.hasFilters).toBe(true);
  });

  it('reports hasFilters false when nothing narrows the query', () => {
    const conditions = toNotificationEmptyStateConditions({
      totalEverRecorded: 5,
      view: 'active',
      degraded: false,
      hasSearch: false,
      hasFacetFilters: false,
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
