import { describe, expect, it } from 'vitest';
import { formatNotificationHeaderSubtitle } from '../notification-center-header.helpers';

describe('formatNotificationHeaderSubtitle', () => {
  it('leads with the live unread count', () => {
    expect(formatNotificationHeaderSubtitle(12)).toBe('12 unread · Warnings and failures stay here after the toast disappears.');
  });

  it('says one unread without a plural', () => {
    expect(formatNotificationHeaderSubtitle(1)).toBe('1 unread · Warnings and failures stay here after the toast disappears.');
  });

  it('says nothing is unread rather than printing a zero', () => {
    expect(formatNotificationHeaderSubtitle(0)).toBe('No unread · Warnings and failures stay here after the toast disappears.');
  });

  it('never claims an ordering the list does not apply', () => {
    // The store sorts by created_at_ms DESC, id DESC. Read state is not in
    // that sort at all, so the page must not tell the user it is.
    expect(formatNotificationHeaderSubtitle(3)).not.toContain('unread first');
  });
});
