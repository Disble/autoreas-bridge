import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { Notification } from '../../../../../shared/contracts/notification.types';
import type { NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
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
    markUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

/** Builds one master-list row; only the id and title distinguish the fixtures below. */
function makeRow(id: number): NotificationRow {
  return { id, createdAtMs: id * 1000, title: `Row ${id}`, body: '', level: 'info', source: 'download', actionCount: 0 };
}

/** A controllable stand-in for the `notification.push` runtime stream. */
function makePushSource(): { readonly source: NotificationSource; emit: () => void } {
  const listeners: ((notification: Notification) => void)[] = [];

  return {
    emit() {
      const pushed: Notification = {
        Title: 'Download run started',
        Body: '',
        Level: 'info',
        Source: 'download',
        CorrelationID: 'run-9',
        Timestamp: '2026-08-24T12:00:00Z',
      };
      for (const listener of listeners) {
        listener(pushed);
      }
    },
    source: {
      subscribe(listener) {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      },
      subscribeArchived() {
        return () => undefined;
      },
      subscribeNavigate() {
        return () => undefined;
      },
    },
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

  it('merges a push refresh on top of the pages already loaded instead of collapsing them', async () => {
    // Two pages are loaded first, then a push arrives. The refreshed first
    // page carries a brand new record plus the page-one rows it already had;
    // page two's rows must survive it, or a live event would silently undo
    // the user's paging.
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({ items: [makeRow(3), makeRow(2)], nextCursor: 'cursor-1', appliedLimit: 2, totalEver: 3, degraded: false })
      .mockResolvedValueOnce({ items: [makeRow(1)], appliedLimit: 2, totalEver: 3, degraded: false })
      .mockResolvedValue({ items: [makeRow(4), makeRow(3), makeRow(2)], nextCursor: 'cursor-1', appliedLimit: 2, totalEver: 4, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);
    const { result } = renderHook(() =>
      useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: false, view: 'active' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.onLoadMore();
    });
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([3, 2, 1]));

    act(() => {
      push.emit();
    });

    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([4, 3, 2, 1]));
  });

  it('leaves the pagination cursor where the user paged to, so the next load-more does not re-fetch page one', async () => {
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({ items: [makeRow(3)], nextCursor: 'cursor-after-3', appliedLimit: 1, totalEver: 3, degraded: false })
      // The refreshed first page reports its OWN cursor. Adopting it would
      // rewind pagination to the top of the list.
      .mockResolvedValue({ items: [makeRow(4), makeRow(3)], nextCursor: 'cursor-after-4', appliedLimit: 1, totalEver: 4, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);
    const { result } = renderHook(() =>
      useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: false, view: 'active' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      push.emit();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => {
      result.current.onLoadMore();
    });

    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-after-3' }));
  });

  it('refreshes under the filters currently applied rather than an unfiltered first page', async () => {
    const listNotifications = vi.fn().mockResolvedValue({ items: [makeRow(1)], appliedLimit: 25, totalEver: 1, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);
    const { result } = renderHook(() =>
      useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: true, view: 'archived', search: 'one piece' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      push.emit();
    });

    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
    expect(listNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: '', search: 'one piece', unreadOnly: true, view: 'archived' }),
    );
  });

  it('stops listening once unmounted', async () => {
    const listNotifications = vi.fn().mockResolvedValue({ items: [makeRow(1)], appliedLimit: 25, totalEver: 1, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);
    const { result, unmount } = renderHook(() =>
      useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: false, view: 'active' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    unmount();

    act(() => {
      push.emit();
    });

    expect(listNotifications).toHaveBeenCalledTimes(1);
  });
});
