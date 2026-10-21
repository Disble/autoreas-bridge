import { describe, expect, it } from 'vitest';
import { formatUnreadChipLabel } from '../notification-center-header.helpers';

describe('formatUnreadChipLabel', () => {
  it.each([
    [12, '12 unread'],
    [1, '1 unread'],
  ])('labels %i unread records as "%s"', (unreadCount, label) => {
    expect(formatUnreadChipLabel(unreadCount)).toBe(label);
  });

  it.each([0, -1])('hides the chip when %i records are unread', (unreadCount) => {
    expect(formatUnreadChipLabel(unreadCount)).toBeNull();
  });
});
