import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNotificationUnreadCount } from '../use-notification-unread-count';
import { createCenterSource, notificationsQueryWrapper } from './notification-center.test-support';

describe('useNotificationUnreadCount', () => {
  it('shows 0 until the count is read, then the count the source answered', async () => {
    const getUnreadCount = vi.fn().mockResolvedValue(3);
    const { result } = renderHook(
      () => useNotificationUnreadCount({ source: createCenterSource({ getUnreadCount }), refetchList: vi.fn(), applyReadState: vi.fn() }),
      { wrapper: notificationsQueryWrapper().wrapper },
    );

    expect(result.current.unreadCount).toBe(0);
    await waitFor(() => expect(result.current.unreadCount).toBe(3));
  });

  it('refreshes the list and reads the count again after a mutation', async () => {
    const getUnreadCount = vi.fn().mockResolvedValueOnce(3).mockResolvedValue(1);
    const refetchList = vi.fn();
    const { result } = renderHook(
      () => useNotificationUnreadCount({ source: createCenterSource({ getUnreadCount }), refetchList, applyReadState: vi.fn() }),
      { wrapper: notificationsQueryWrapper().wrapper },
    );
    await waitFor(() => expect(result.current.unreadCount).toBe(3));

    act(() => {
      result.current.onMutated();
    });

    expect(refetchList).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });

  it('patches the rows and reads the count again when a read state changes', async () => {
    const getUnreadCount = vi.fn().mockResolvedValueOnce(2).mockResolvedValue(0);
    const applyReadState = vi.fn();
    const { result } = renderHook(
      () => useNotificationUnreadCount({ source: createCenterSource({ getUnreadCount }), refetchList: vi.fn(), applyReadState }),
      { wrapper: notificationsQueryWrapper().wrapper },
    );
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    act(() => {
      result.current.onReadStateChanged([7], true);
    });

    expect(applyReadState).toHaveBeenCalledWith([7], true);
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });
});
