import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource, NotificationMutationResult } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationMarkUnread } from '../use-notification-mark-unread';
import { notificationsQueryWrapper } from '../../NotificationCenterPanel/__tests__/notification-center.test-support';

/** Builds a fake `NotificationCenterSource` whose `markUnread` resolves to a fixed result, mirroring `use-notification-archive.test.ts`'s own injectable-source fake. */
function buildMarkUnreadSource(result: NotificationMutationResult = { affected: 1, degraded: false, unreadCount: 1 }): NotificationCenterSource {
  return { markUnread: vi.fn().mockResolvedValue(result) } as unknown as NotificationCenterSource;
}

/** Builds a fake source whose `markUnread` fails, as it does when the module is not ready or the store fails. */
function buildFailingMarkUnreadSource(): NotificationCenterSource {
  return { markUnread: vi.fn().mockRejectedValue(new Error('store closed')) } as unknown as NotificationCenterSource;
}

/** Builds a fake source whose `markUnread` never settles, so a test can observe the in-flight window. */
function buildPendingMarkUnreadSource(): NotificationCenterSource {
  return { markUnread: vi.fn().mockReturnValue(new Promise<NotificationMutationResult>(() => undefined)) } as unknown as NotificationCenterSource;
}

describe('useNotificationMarkUnread', () => {
  it('marks its record unread, reports it, and re-enables for a second real press', async () => {
    const source = buildMarkUnreadSource();
    const onReadStateChanged = vi.fn();
    const { result } = renderHook(() => useNotificationMarkUnread(7, source, onReadStateChanged), { wrapper: notificationsQueryWrapper().wrapper });

    expect(result.current.isDisabled).toBe(false);

    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledWith([7]);
    });
    // The badge climbed from the first version of this hook, but the row beside
    // the pane kept rendering as read -- the button moved a number and left the
    // list telling the opposite story.
    await waitFor(() => expect(onReadStateChanged).toHaveBeenCalledWith([7], false));
    // Unlike archive, this button does NOT latch down once it settles. A record
    // that is already unread is put unread again to exactly the same state, and
    // re-opening the pane's record marks it read behind the button -- a latched
    // button would then be a control claiming there is nothing left to do about
    // a record that is, once again, read.
    await waitFor(() => {
      expect(result.current.isDisabled).toBe(false);
    });

    // Re-enabling is worth nothing if the press it invites is swallowed: the
    // in-flight ref has to be released too, and `isDisabled` alone cannot prove
    // that it was.
    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => expect(source.markUnread).toHaveBeenCalledTimes(2));
  });

  // Two synchronous presses in the same event both read the same stale
  // `isDisabled` before React re-renders, so the in-flight guard has to be a
  // ref rather than the state alone -- the same guard `useNotificationArchive`
  // carries, for the same reason.
  it('disables while in flight and ignores a second press meanwhile', async () => {
    const source = buildPendingMarkUnreadSource();
    const { result } = renderHook(() => useNotificationMarkUnread(7, source), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.markUnread();
      result.current.markUnread();
    });

    expect(result.current.isDisabled).toBe(true);
    await waitFor(() => expect(source.markUnread).toHaveBeenCalledTimes(1));
    expect(result.current.isDisabled).toBe(true);
  });

  // The pane does not remount between records: pressing another row swaps
  // `detail` while this hook keeps its instance and receives a new
  // `notificationId`.
  it('marks the record currently open unread, not the one that was open when it first rendered', async () => {
    const source = buildMarkUnreadSource();
    const { rerender, result } = renderHook((notificationId: number) => useNotificationMarkUnread(notificationId, source), { wrapper: notificationsQueryWrapper().wrapper, initialProps: 7 });

    rerender(9);
    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledWith([9]);
    });
  });

  it('reports nothing when the mutation failed, rather than showing a dot for a record still marked read', async () => {
    const onReadStateChanged = vi.fn();
    const source = buildFailingMarkUnreadSource();
    const { result } = renderHook(() => useNotificationMarkUnread(7, source, onReadStateChanged), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.markUnread();
    });

    await waitFor(() => expect(result.current.isDisabled).toBe(false));
    expect(onReadStateChanged).not.toHaveBeenCalled();
  });
});
