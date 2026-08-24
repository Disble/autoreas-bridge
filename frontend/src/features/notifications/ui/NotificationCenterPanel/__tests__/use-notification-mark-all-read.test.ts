import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import {
  getNotificationStoreState,
  resetNotificationStore,
  setUnreadNotificationCount,
} from '../../../../../shared/store/notification-store/notification-store.helpers';
import { useNotificationMarkAllRead } from '../use-notification-mark-all-read';

beforeEach(resetNotificationStore);

/**
 * Builds a row carrying only the id and read state this hook reads.
 * @param id The record id.
 * @param readAtMs When the record was read, or `undefined` while it is unread.
 * @returns One `NotificationRow`.
 */
function buildRow(id: number, readAtMs?: number): NotificationRow {
  return { id, createdAtMs: 1_000 * id, title: `Row ${id}`, body: '', level: 'info', source: 'download', actionCount: 0, readAtMs };
}

/**
 * Builds a source whose `markRead` is the only wired method.
 * @param markRead The spy to answer `markRead` with.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(markRead: NotificationCenterSource['markRead']): NotificationCenterSource {
  return {
    listNotifications: vi.fn(),
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead,
    markUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

describe('useNotificationMarkAllRead', () => {
  it('marks every unread record the list holds, leaving the already-read ones alone', async () => {
    const markRead = vi.fn().mockResolvedValue({ affected: 2, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const rows = [buildRow(1), buildRow(2, 1_700_000_000_000), buildRow(3)];
    const { result } = renderHook(() => useNotificationMarkAllRead({ source: makeSource(markRead), rows, onMutated }));

    expect(result.current.canMarkAllRead).toBe(true);

    await act(async () => {
      result.current.onMarkAllRead();
    });

    expect(markRead).toHaveBeenCalledWith([1, 3]);
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('feeds the mutation’s own fresh unread count into the shared store, so the rail badge falls with it', async () => {
    setUnreadNotificationCount(9);
    const markRead = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 4, degraded: false });
    const { result } = renderHook(() =>
      useNotificationMarkAllRead({ source: makeSource(markRead), rows: [buildRow(1)], onMutated: vi.fn() }),
    );

    await act(async () => {
      result.current.onMarkAllRead();
    });

    expect(getNotificationStoreState().unreadCount).toBe(4);
  });

  it('issues no mutation at all when nothing loaded is unread, even if the press gets through', async () => {
    // The header disables the button in that state, but the guard is what makes
    // the hook safe on its own: without it a press would send markRead([]),
    // which asks the backend to mark nothing and then refetches for no reason.
    const markRead = vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const { result } = renderHook(() =>
      useNotificationMarkAllRead({ source: makeSource(markRead), rows: [buildRow(1, 1_700_000_000_000)], onMutated }),
    );

    expect(result.current.canMarkAllRead).toBe(false);

    await act(async () => {
      result.current.onMarkAllRead();
    });

    expect(markRead).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
  });
});
