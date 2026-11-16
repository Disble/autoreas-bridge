import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationMarkAllRead } from '../use-notification-mark-all-read';
import { createCenterSource, notificationsQueryWrapper } from './notification-center.test-support';

/**
 * Builds a row carrying only the id and read state this hook reads.
 * @param id The record id.
 * @param readAtMs When the record was read, or `undefined` while it is unread.
 * @returns One `NotificationRow`.
 */
function buildRow(id: number, readAtMs?: number): NotificationRow {
  return { id, createdAtMs: 1_000 * id, title: `Row ${id}`, body: '', level: 'info', source: 'download', actionCount: 0, readAtMs };
}

describe('useNotificationMarkAllRead', () => {
  it('marks every unread record the list holds, leaving the already-read ones alone', async () => {
    const markRead = vi.fn().mockResolvedValue({ affected: 2, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const rows = [buildRow(1), buildRow(2, 1_700_000_000_000), buildRow(3)];
    const { result } = renderHook(() => useNotificationMarkAllRead({ source: createCenterSource({ markRead }), rows, onMutated }), {
      wrapper: notificationsQueryWrapper().wrapper,
    });

    expect(result.current.canMarkAllRead).toBe(true);

    await act(async () => {
      result.current.onMarkAllRead();
    });

    expect(markRead).toHaveBeenCalledWith([1, 3]);
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
  });

  it('still lets the caller refetch when the mutation fails, so the list and the badge never keep a guess', async () => {
    const markRead = vi.fn().mockRejectedValue(new Error('store closed'));
    const onMutated = vi.fn();
    const { result } = renderHook(
      () => useNotificationMarkAllRead({ source: createCenterSource({ markRead }), rows: [buildRow(1)], onMutated }),
      { wrapper: notificationsQueryWrapper().wrapper },
    );

    await act(async () => {
      result.current.onMarkAllRead();
    });

    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
  });

  it('issues no mutation at all when nothing loaded is unread, even if the press gets through', async () => {
    // The header disables the button in that state, but the guard is what makes
    // the hook safe on its own: without it a press would send markRead([]),
    // which asks the backend to mark nothing and then refetches for no reason.
    const markRead = vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const { result } = renderHook(
      () => useNotificationMarkAllRead({ source: createCenterSource({ markRead }), rows: [buildRow(1, 1_700_000_000_000)], onMutated }),
      { wrapper: notificationsQueryWrapper().wrapper },
    );

    expect(result.current.canMarkAllRead).toBe(false);

    await act(async () => {
      result.current.onMarkAllRead();
    });

    expect(markRead).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
  });
});
