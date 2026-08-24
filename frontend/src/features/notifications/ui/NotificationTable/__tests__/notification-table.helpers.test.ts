import { describe, expect, it } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import {
  formatNotificationRowCount,
  formatNotificationSubjects,
  isNotificationRowUnread,
} from '../notification-table.helpers';

/**
 * Builds a row carrying only what a case is about, over a minimal base -- the
 * helpers below read four fields and nothing else.
 * @param overrides The fields under test.
 * @returns One `NotificationRow`.
 */
function buildRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return { id: 1, createdAtMs: 1_700_000_000_000, title: 'Run stopped', body: '', level: 'warning', source: 'download', actionCount: 0, ...overrides };
}

describe('isNotificationRowUnread', () => {
  it('reads an absent readAtMs as unread', () => {
    // `readAtMs` is omitempty on the wire, so this is what every unread record
    // actually arrives as.
    expect(isNotificationRowUnread(buildRow())).toBe(true);
  });

  it('reads a zero readAtMs as unread rather than as read at the epoch', () => {
    expect(isNotificationRowUnread(buildRow({ readAtMs: 0 }))).toBe(true);
  });

  it('reads a real readAtMs as read', () => {
    expect(isNotificationRowUnread(buildRow({ readAtMs: 1_700_000_500_000 }))).toBe(false);
  });
});

describe('formatNotificationSubjects', () => {
  it('joins the named subjects into one line', () => {
    expect(formatNotificationSubjects(buildRow({ subjects: ['Frieren', 'Eureka'] }))).toBe('Frieren · Eureka');
  });

  it('names a single subject without a separator', () => {
    expect(formatNotificationSubjects(buildRow({ subjects: ['Frieren'] }))).toBe('Frieren');
  });

  it('returns undefined when the row names nothing, so no empty line renders', () => {
    expect(formatNotificationSubjects(buildRow())).toBeUndefined();
    expect(formatNotificationSubjects(buildRow({ subjects: [] }))).toBeUndefined();
  });

  it('drops blank names instead of rendering a stray separator', () => {
    expect(formatNotificationSubjects(buildRow({ subjects: ['Frieren', ''] }))).toBe('Frieren');
    expect(formatNotificationSubjects(buildRow({ subjects: ['', ''] }))).toBeUndefined();
  });
});

describe('formatNotificationRowCount', () => {
  it('badges the count when the named subjects do not account for every thing', () => {
    expect(formatNotificationRowCount(buildRow({ rowCount: 3, subjects: ['Frieren', 'Eureka'] }))).toBe('3×');
  });

  it('badges the count for several things it can name none of', () => {
    expect(formatNotificationRowCount(buildRow({ rowCount: 4 }))).toBe('4×');
  });

  it('badges nothing when the subject line already names every thing', () => {
    expect(formatNotificationRowCount(buildRow({ rowCount: 2, subjects: ['Frieren', 'Eureka'] }))).toBeUndefined();
  });

  it('badges nothing for a record standing for one thing', () => {
    expect(formatNotificationRowCount(buildRow({ rowCount: 1 }))).toBeUndefined();
    expect(formatNotificationRowCount(buildRow({ rowCount: 1, subjects: ['Frieren'] }))).toBeUndefined();
  });

  it('badges nothing, never a zero, when no count reached the row at all', () => {
    expect(formatNotificationRowCount(buildRow())).toBeUndefined();
    expect(formatNotificationRowCount(buildRow({ rowCount: 0 }))).toBeUndefined();
  });

  it('counts blank names as unnamed, so the badge still says how many there are', () => {
    // A blank name never reaches the subject line, so it must not silently
    // suppress the badge that says something is unaccounted for.
    expect(formatNotificationRowCount(buildRow({ rowCount: 2, subjects: ['Frieren', ''] }))).toBe('2×');
  });
});
