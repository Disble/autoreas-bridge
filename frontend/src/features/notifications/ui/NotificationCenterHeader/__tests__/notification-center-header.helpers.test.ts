import { describe, expect, it } from 'vitest';
import { formatUnreadChipLabel } from '../notification-center-header.helpers';

describe('formatUnreadChipLabel', () => {
  it('labels the unread count', () => {
    const cases = [
      [12, '12 unread'],
      [1, '1 unread'],
    ] as const;

    for (const [unreadCount, label] of cases) {
      const caseName = `labels ${String(unreadCount)} unread records as "${String(label)}"`;
      expect.soft(formatUnreadChipLabel(unreadCount), caseName).toBe(label);
    }
  });

  it('hides the chip when no record is unread', () => {
    const cases = [0, -1];

    for (const unreadCount of cases) {
      const caseName = `hides the chip when ${String(unreadCount)} records are unread`;
      expect.soft(formatUnreadChipLabel(unreadCount), caseName).toBeNull();
    }
  });
});
