import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource, NotificationMutationResult } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationArchive } from '../use-notification-archive';
import { notificationsQueryWrapper } from '../../NotificationCenterPanel/__tests__/notification-center.test-support';

/** Builds a fake `NotificationCenterSource` whose `archive` resolves to a fixed result, mirroring `use-notification-action.test.ts`'s own injectable-source fake. */
function buildArchiveSource(result: NotificationMutationResult = { affected: 1, degraded: false, unreadCount: 0 }): NotificationCenterSource {
  return { archive: vi.fn().mockResolvedValue(result) } as unknown as NotificationCenterSource;
}

/** Builds a fake source whose `archive` fails, as it does when the module is not ready or the store fails. */
function buildFailingArchiveSource(): NotificationCenterSource {
  return { archive: vi.fn().mockRejectedValue(new Error('store closed')) } as unknown as NotificationCenterSource;
}

/** Builds a fake source whose `archive` never settles, so a test can observe the in-flight window. */
function buildPendingArchiveSource(): NotificationCenterSource {
  return { archive: vi.fn().mockReturnValue(new Promise<NotificationMutationResult>(() => undefined)) } as unknown as NotificationCenterSource;
}

describe('useNotificationArchive', () => {
  it('starts enabled, with nothing archived yet', () => {
    const { result } = renderHook(() => useNotificationArchive(7, buildArchiveSource()), { wrapper: notificationsQueryWrapper().wrapper });

    expect(result.current.isDisabled).toBe(false);
  });

  it('archives exactly the record it was given, as the single-id batch the binding takes', async () => {
    const source = buildArchiveSource();
    const { result } = renderHook(() => useNotificationArchive(7, source), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.archive();
    });

    await waitFor(() => {
      expect(source.archive).toHaveBeenCalledWith([7]);
    });
  });

  it('disables itself once the record is archived, since archiving it twice is not a second outcome', async () => {
    const source = buildArchiveSource();
    const { result } = renderHook(() => useNotificationArchive(7, source), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.archive();
    });

    await waitFor(() => {
      expect(result.current.isDisabled).toBe(true);
    });
  });

  it('disables itself immediately on press, before the backend has answered', () => {
    const { result } = renderHook(() => useNotificationArchive(7, buildPendingArchiveSource()), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.archive();
    });

    expect(result.current.isDisabled).toBe(true);
  });

  // Two synchronous presses in the same event both read the same stale
  // `isDisabled` before React re-renders, so the in-flight guard has to be a
  // ref rather than the state alone -- the same guard `useNotificationAction`
  // carries, for the same reason.
  it('never issues a second archive for a press that lands while the first is still in flight', async () => {
    const source = buildPendingArchiveSource();
    const { result } = renderHook(() => useNotificationArchive(7, source), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.archive();
      result.current.archive();
    });

    await waitFor(() => expect(source.archive).toHaveBeenCalledTimes(1));
    expect(result.current.isDisabled).toBe(true);
  });

  // A failed archive means the module was not ready or the store failed and
  // NOTHING was archived. Leaving the button disabled there would show the user the
  // shape of success for an operation that did not happen.
  it('re-enables itself after a failed archive, because nothing was archived', async () => {
    const source = buildFailingArchiveSource();
    const { result } = renderHook(() => useNotificationArchive(7, source), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.archive();
    });

    await waitFor(() => {
      expect(result.current.isDisabled).toBe(false);
    });
  });

  // Re-enabling is worth nothing if the press it invites is swallowed: the
  // in-flight ref has to be released too, and `isDisabled` alone cannot prove
  // that it was.
  it('really issues a second archive when a press follows a failed one', async () => {
    const source = buildFailingArchiveSource();
    const { result } = renderHook(() => useNotificationArchive(7, source), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.archive();
    });
    await waitFor(() => {
      expect(result.current.isDisabled).toBe(false);
    });
    act(() => {
      result.current.archive();
    });

    await waitFor(() => expect(source.archive).toHaveBeenCalledTimes(2));
  });

  // The pane does not remount between records: pressing another row swaps
  // `detail` and this hook keeps its instance, with a new `notificationId`.
  // A settled flag that does not follow the record would leave the next one
  // showing an archive button that is already down.
  it('offers an enabled archive button again once a different record is opened in the same pane', async () => {
    const source = buildArchiveSource();
    const { rerender, result } = renderHook((notificationId: number) => useNotificationArchive(notificationId, source), { wrapper: notificationsQueryWrapper().wrapper, initialProps: 7 });

    act(() => {
      result.current.archive();
    });
    await waitFor(() => {
      expect(result.current.isDisabled).toBe(true);
    });
    rerender(9);

    expect(result.current.isDisabled).toBe(false);
  });

  it('archives the record currently open, not the one that was open when it first rendered', async () => {
    const source = buildArchiveSource();
    const { rerender, result } = renderHook((notificationId: number) => useNotificationArchive(notificationId, source), { wrapper: notificationsQueryWrapper().wrapper, initialProps: 7 });

    rerender(9);
    act(() => {
      result.current.archive();
    });

    await waitFor(() => {
      expect(source.archive).toHaveBeenCalledWith([9]);
    });
  });

  // `affected: 0` without `degraded` is a successful no-op -- the record was
  // already archived. That is settled, not failed, so the button stays down.
  it('stays disabled when the store reports the record was already archived', async () => {
    const source = buildArchiveSource({ affected: 0, degraded: false, unreadCount: 0 });
    const { result } = renderHook(() => useNotificationArchive(7, source), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.archive();
    });

    await waitFor(() => {
      expect(source.archive).toHaveBeenCalledWith([7]);
    });
    expect(result.current.isDisabled).toBe(true);
  });
});
