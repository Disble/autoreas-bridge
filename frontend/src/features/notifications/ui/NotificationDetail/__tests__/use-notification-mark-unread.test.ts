import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationMutationResult } from '../../../../../shared/contracts/notification-center.types';
import {
  getNotificationStoreState,
  resetNotificationStore,
  setUnreadNotificationCount,
} from '../../../../../shared/store/notification-store/notification-store.helpers';
import { useNotificationMarkUnread } from '../use-notification-mark-unread';

beforeEach(resetNotificationStore);

/** Builds a fake `NotificationCenterSource` whose `markUnread` resolves to a fixed result, mirroring `use-notification-archive.test.ts`'s own injectable-source fake. */
function buildMarkUnreadSource(result: NotificationMutationResult = { affected: 1, degraded: false, unreadCount: 1 }): NotificationCenterSource {
  return { markUnread: vi.fn().mockResolvedValue(result) } as unknown as NotificationCenterSource;
}

/** Builds a fake source whose `markUnread` never settles, so a test can observe the in-flight window. */
function buildPendingMarkUnreadSource(): NotificationCenterSource {
  return { markUnread: vi.fn().mockReturnValue(new Promise<NotificationMutationResult>(() => undefined)) } as unknown as NotificationCenterSource;
}

describe('useNotificationMarkUnread', () => {
  it('starts enabled, with nothing marked unread yet', () => {
    const { result } = renderHook(() => useNotificationMarkUnread(7, buildMarkUnreadSource()));

    expect(result.current.isDisabled).toBe(false);
  });

  it('marks exactly the record it was given unread, as the single-id batch the binding takes', async () => {
    const source = buildMarkUnreadSource();
    const { result } = renderHook(() => useNotificationMarkUnread(7, source));

    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledWith([7]);
    });
  });

  // The whole point of the verb: the rail badge has to CLIMB. The count is
  // taken from the mutation's own envelope rather than derived locally, so
  // the number is written as a literal that no production symbol supplies.
  it("raises the shared unread count to the backend's own fresh number", async () => {
    setUnreadNotificationCount(0);
    const source = buildMarkUnreadSource({ affected: 1, degraded: false, unreadCount: 3 });
    const { result } = renderHook(() => useNotificationMarkUnread(7, source));

    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => {
      expect(getNotificationStoreState().unreadCount).toBe(3);
    });
  });

  // A degraded result means the store was unavailable and NOTHING was marked
  // unread. Taking its placeholder zero would clear a badge still standing
  // for records that are genuinely unread.
  it('leaves the unread count alone when the mutation comes back degraded', async () => {
    setUnreadNotificationCount(5);
    const source = buildMarkUnreadSource({ affected: 0, degraded: true, unreadCount: 0 });
    const { result } = renderHook(() => useNotificationMarkUnread(7, source));

    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledWith([7]);
    });
    expect(getNotificationStoreState().unreadCount).toBe(5);
  });

  it('disables itself while the press is in flight, before the backend has answered', () => {
    const { result } = renderHook(() => useNotificationMarkUnread(7, buildPendingMarkUnreadSource()));

    act(() => {
      result.current.markUnread();
    });

    expect(result.current.isDisabled).toBe(true);
  });

  // Two synchronous presses in the same event both read the same stale
  // `isDisabled` before React re-renders, so the in-flight guard has to be a
  // ref rather than the state alone -- the same guard `useNotificationArchive`
  // carries, for the same reason.
  it('never issues a second mark-unread for a press that lands while the first is still in flight', () => {
    const source = buildPendingMarkUnreadSource();
    const { result } = renderHook(() => useNotificationMarkUnread(7, source));

    act(() => {
      result.current.markUnread();
      result.current.markUnread();
    });

    expect(source.markUnread).toHaveBeenCalledTimes(1);
  });

  // Unlike archive, this button does NOT latch down once it settles. A record
  // that is already unread is put unread again to exactly the same state, and
  // re-opening the pane's record marks it read behind the button -- a latched
  // button would then be a control claiming there is nothing left to do about
  // a record that is, once again, read.
  it('comes back enabled once the mutation settles, because the verb is idempotent', async () => {
    const source = buildMarkUnreadSource();
    const { result } = renderHook(() => useNotificationMarkUnread(7, source));

    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => {
      expect(result.current.isDisabled).toBe(false);
    });
  });

  // Re-enabling is worth nothing if the press it invites is swallowed: the
  // in-flight ref has to be released too, and `isDisabled` alone cannot prove
  // that it was.
  it('really issues a second mark-unread when a press follows a settled one', async () => {
    const source = buildMarkUnreadSource();
    const { result } = renderHook(() => useNotificationMarkUnread(7, source));

    act(() => {
      result.current.markUnread();
    });
    await waitFor(() => {
      expect(result.current.isDisabled).toBe(false);
    });
    act(() => {
      result.current.markUnread();
    });

    expect(source.markUnread).toHaveBeenCalledTimes(2);
  });

  // The pane does not remount between records: pressing another row swaps
  // `detail` while this hook keeps its instance and receives a new
  // `notificationId`.
  it('marks the record currently open unread, not the one that was open when it first rendered', async () => {
    const source = buildMarkUnreadSource();
    const { rerender, result } = renderHook((notificationId: number) => useNotificationMarkUnread(notificationId, source), { initialProps: 7 });

    rerender(9);
    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledWith([9]);
    });
  });
});
