import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationPage } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationCenterSync } from '../use-notification-center-sync';

/** A promise plus its own external resolver, so a test controls exactly when a fetch settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveFn) => {
    resolve = resolveFn;
  });
  return { promise, resolve };
}

/** A fake source with only `listNotifications` wired; every other method is an unused stub. */
function makeSource(listNotifications: NotificationCenterSource['listNotifications']): NotificationCenterSource {
  return {
    listNotifications,
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
}

describe('useNotificationCenterSync', () => {
  it('fetches the first page on mount', async () => {
    const page: NotificationPage = {
      items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    };
    const listNotifications = vi.fn().mockResolvedValue(page);
    const source = makeSource(listNotifications);

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toEqual(page.items);
    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it('guards onLoadMore against re-entry while a fetch is already in flight, and fires again once the fetch settles', async () => {
    const firstPage = deferred<NotificationPage>();
    const secondPage = deferred<NotificationPage>();
    const listNotifications = vi
      .fn()
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise);
    const source = makeSource(listNotifications);

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    act(() => {
      firstPage.resolve({
        items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
        nextCursor: 'cursor-1',
        appliedLimit: 1,
        totalEver: 2,
        degraded: false,
      });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    // Two near-bottom triggers arrive before the fetch they started resolves:
    // only the first must actually call the source.
    act(() => {
      result.current.onLoadMore();
      result.current.onLoadMore();
    });

    expect(listNotifications).toHaveBeenCalledTimes(2);

    act(() => {
      secondPage.resolve({
        items: [{ id: 2, createdAtMs: 2000, title: 'B', body: '', level: 'info', source: 'download', actionCount: 0 }],
        appliedLimit: 1,
        totalEver: 2,
        degraded: false,
      });
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);

    // The backend reported no further cursor: a third near-bottom trigger
    // must not fire another fetch at all.
    act(() => {
      result.current.onLoadMore();
    });
    expect(listNotifications).toHaveBeenCalledTimes(2);
  });

  it('appends the next page after the previous rows rather than replacing them', async () => {
    const firstPage = deferred<NotificationPage>();
    const secondPage = deferred<NotificationPage>();
    const listNotifications = vi
      .fn()
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise);
    const source = makeSource(listNotifications);

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    act(() => {
      firstPage.resolve({
        items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
        nextCursor: 'cursor-1',
        appliedLimit: 1,
        totalEver: 3,
        degraded: false,
      });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onLoadMore();
    });
    act(() => {
      secondPage.resolve({
        items: [{ id: 2, createdAtMs: 900, title: 'B', body: '', level: 'info', source: 'download', actionCount: 0 }],
        appliedLimit: 1,
        totalEver: 3,
        degraded: false,
      });
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows.map((row) => row.id)).toEqual([1, 2]);
  });

  it('re-fetches from scratch when the view or unreadOnly filter changes', async () => {
    const listNotifications = vi.fn().mockImplementation((request) =>
      Promise.resolve({
        items: [{ id: request.view === 'archived' ? 9 : 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
        appliedLimit: 25,
        totalEver: 1,
        degraded: false,
      }),
    );
    const source = makeSource(listNotifications);

    const { rerender, result } = renderHook<ReturnType<typeof useNotificationCenterSync>, { view: 'active' | 'archived' }>(
      ({ view }) => useNotificationCenterSync({ source, unreadOnly: false, view }),
      { initialProps: { view: 'active' } },
    );

    await waitFor(() => expect(result.current.rows).toEqual([expect.objectContaining({ id: 1 })]));

    rerender({ view: 'archived' });

    await waitFor(() => expect(result.current.rows).toEqual([expect.objectContaining({ id: 9 })]));
    expect(listNotifications).toHaveBeenCalledTimes(2);
  });

  it('forwards the search filter to every listNotifications call, and re-fetches from scratch when it changes', async () => {
    const listNotifications = vi.fn().mockResolvedValue({
      items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    });
    const source = makeSource(listNotifications);

    const { rerender, result } = renderHook<ReturnType<typeof useNotificationCenterSync>, { search: string }>(
      ({ search }) => useNotificationCenterSync({ source, unreadOnly: false, view: 'active', search }),
      { initialProps: { search: '' } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ search: '' }));

    rerender({ search: 'one piece' });

    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'one piece' }));
  });

  it('refetch re-fetches the first page from scratch', async () => {
    const page: NotificationPage = {
      items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    };
    const listNotifications = vi.fn().mockResolvedValue(page);
    const source = makeSource(listNotifications);

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listNotifications).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '' }));
  });
});
