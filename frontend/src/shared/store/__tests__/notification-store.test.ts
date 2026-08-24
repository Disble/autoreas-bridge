import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyNotificationMutationUnreadCount,
  getNotificationStoreState,
  incrementUnreadNotificationCount,
  resetNotificationStore,
  setUnreadNotificationCount,
} from '../notification-store/notification-store.helpers';

beforeEach(resetNotificationStore);

describe('notification store unread count', () => {
  it('starts with nothing unread', () => {
    expect(getNotificationStoreState().unreadCount).toBe(0);
  });

  it('takes the count the backend reported, replacing whatever was there', () => {
    setUnreadNotificationCount(7);
    expect(getNotificationStoreState().unreadCount).toBe(7);

    setUnreadNotificationCount(2);
    expect(getNotificationStoreState().unreadCount).toBe(2);
  });

  it('raises the count by exactly one per arriving push', () => {
    setUnreadNotificationCount(2);

    incrementUnreadNotificationCount();
    expect(getNotificationStoreState().unreadCount).toBe(3);

    incrementUnreadNotificationCount();
    expect(getNotificationStoreState().unreadCount).toBe(4);
  });

  it('resets back to nothing unread', () => {
    setUnreadNotificationCount(5);

    resetNotificationStore();

    expect(getNotificationStoreState().unreadCount).toBe(0);
  });
});

describe('applyNotificationMutationUnreadCount', () => {
  it("takes the mutation's own fresh count rather than deriving one", () => {
    setUnreadNotificationCount(9);

    // One record was affected but three remain unread: archiving an unread
    // record also marks it read, so the affected count can never stand in
    // for the drop.
    applyNotificationMutationUnreadCount({ affected: 1, unreadCount: 3, degraded: false });

    expect(getNotificationStoreState().unreadCount).toBe(3);
  });

  it('lets a mutation clear the badge entirely', () => {
    setUnreadNotificationCount(1);

    applyNotificationMutationUnreadCount({ affected: 1, unreadCount: 0, degraded: false });

    expect(getNotificationStoreState().unreadCount).toBe(0);
  });

  it('ignores a degraded result, whose zero count is a placeholder and not an answer', () => {
    setUnreadNotificationCount(4);

    applyNotificationMutationUnreadCount({ affected: 0, unreadCount: 0, degraded: true });

    expect(getNotificationStoreState().unreadCount).toBe(4);
  });
});
