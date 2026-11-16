import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource, NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationCenterSync } from '../use-notification-center-sync';
import { createCenterSource, notificationsQueryWrapper } from './notification-center.test-support';

/** A promise plus its own external resolver, so a test controls exactly when a fetch settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveFn) => {
    resolve = resolveFn;
  });
  return { promise, resolve };
}

/**
 * A fake source with only `listNotifications` wired.
 * @param listNotifications The spy to answer `listNotifications` with.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(listNotifications: NotificationCenterSource['listNotifications']): NotificationCenterSource {
  return createCenterSource({ listNotifications });
}

/**
 * Builds one master-list row.
 * @param id The record id.
 * @returns A `NotificationRow` fixture.
 */
function row(id: number): NotificationRow {
  return { id, createdAtMs: id * 1000, title: `Row ${id}`, body: '', level: 'info', source: 'download', actionCount: 0 };
}

/**
 * The keyset-cursor half of `useNotificationCenterSync`: the first page, the
 * near-bottom pagination guard, and the re-fetch each filter change forces.
 * Its sibling `.live.test.ts` covers what arrives without the user asking.
 */
describe('useNotificationCenterSync (pagination)', () => {
  it('fetches the first page on mount', async () => {
    const page: NotificationPage = {
      items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    };
    const listNotifications = vi.fn().mockResolvedValue(page);
    const source = makeSource(listNotifications);

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }), { wrapper: notificationsQueryWrapper().wrapper });

    await waitFor(() => expect(result.current.listState).toBe('ready'));

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

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      firstPage.resolve({
        items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
        nextCursor: 'cursor-1',
        appliedLimit: 1,
        totalEver: 2,
        degraded: false,
      });
    });
    await waitFor(() => expect(result.current.listState).toBe('ready'));
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

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      firstPage.resolve({
        items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
        nextCursor: 'cursor-1',
        appliedLimit: 1,
        totalEver: 3,
        degraded: false,
      });
    });
    await waitFor(() => expect(result.current.listState).toBe('ready'));

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
      { initialProps: { view: 'active' }, wrapper: notificationsQueryWrapper().wrapper },
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
      { initialProps: { search: '' }, wrapper: notificationsQueryWrapper().wrapper },
    );

    await waitFor(() => expect(result.current.listState).toBe('ready'));
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

    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }), { wrapper: notificationsQueryWrapper().wrapper });

    await waitFor(() => expect(result.current.listState).toBe('ready'));
    expect(listNotifications).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '' }));
  });

  it('stays loading without reading while the notifications module starts', async () => {
    const listNotifications = vi.fn().mockResolvedValue({ items: [], appliedLimit: 25, totalEver: 0, degraded: false });
    const { result } = renderHook(() => useNotificationCenterSync({ source: makeSource(listNotifications), unreadOnly: false, view: 'active' }), {
      wrapper: notificationsQueryWrapper('starting').wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.listState).toBe('loading');
    expect(result.current.rows).toEqual([]);
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it('reports a failure, with no rows, when the first page fails', async () => {
    const listNotifications = vi.fn().mockRejectedValue(new Error('store closed'));
    const { result } = renderHook(() => useNotificationCenterSync({ source: makeSource(listNotifications), unreadOnly: false, view: 'active' }), {
      wrapper: notificationsQueryWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.listState).toBe('failure'));
    expect(result.current.rows).toEqual([]);
    expect(result.current.totalEverRecorded).toBe(0);
  });

  it('keeps the rows and the cursor when an older page fails', async () => {
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 }],
        nextCursor: 'cursor-1',
        appliedLimit: 1,
        totalEver: 2,
        degraded: false,
      })
      .mockRejectedValueOnce(new Error('store closed'));
    const { result } = renderHook(() => useNotificationCenterSync({ source: makeSource(listNotifications), unreadOnly: false, view: 'active' }), {
      wrapper: notificationsQueryWrapper().wrapper,
    });
    await waitFor(() => expect(result.current.listState).toBe('ready'));

    await act(async () => {
      result.current.onLoadMore();
      await Promise.resolve();
    });

    expect(listNotifications).toHaveBeenCalledTimes(2);
    expect(result.current.rows.map((row) => row.id)).toEqual([1]);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.listState).toBe('ready');
  });

  it('rebuilds the list from scratch on refetch, dropping the older pages it had loaded', async () => {
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({ items: [row(1)], nextCursor: 'cursor-1', appliedLimit: 1, totalEver: 3, degraded: false })
      .mockResolvedValueOnce({ items: [row(2)], appliedLimit: 1, totalEver: 3, degraded: false })
      .mockResolvedValue({ items: [row(3)], appliedLimit: 1, totalEver: 1, degraded: false });
    const { result } = renderHook(() => useNotificationCenterSync({ source: makeSource(listNotifications), unreadOnly: false, view: 'active' }), {
      wrapper: notificationsQueryWrapper().wrapper,
    });
    await waitFor(() => expect(result.current.listState).toBe('ready'));
    act(() => {
      result.current.onLoadMore();
    });
    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toEqual([1, 2]));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toEqual([3]));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('keeps the rows and stays ready when a refresh of the first page fails', async () => {
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({ items: [row(1)], appliedLimit: 25, totalEver: 1, degraded: false })
      .mockRejectedValue(new Error('store closed'));
    const { result } = renderHook(() => useNotificationCenterSync({ source: makeSource(listNotifications), unreadOnly: false, view: 'active' }), {
      wrapper: notificationsQueryWrapper().wrapper,
    });
    await waitFor(() => expect(result.current.listState).toBe('ready'));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.listState).toBe('ready');
    expect(result.current.rows.map((item) => item.id)).toEqual([1]);
  });

  it('shows the previous filters rows without a cursor while the new filters load, then drops an older page read under them', async () => {
    const olderPage = deferred<NotificationPage>();
    const archivedPage = deferred<NotificationPage>();
    const listNotifications = vi.fn((request: { readonly view: string; readonly cursor: string }) => {
      if (request.view === 'archived') {
        return archivedPage.promise;
      }
      return request.cursor === '' ? Promise.resolve({ items: [row(1)], nextCursor: 'cursor-1', appliedLimit: 1, totalEver: 2, degraded: false }) : olderPage.promise;
    });
    const { rerender, result } = renderHook<ReturnType<typeof useNotificationCenterSync>, { view: 'active' | 'archived' }>(
      ({ view }) => useNotificationCenterSync({ source: makeSource(listNotifications), unreadOnly: false, view }),
      { initialProps: { view: 'active' }, wrapper: notificationsQueryWrapper().wrapper },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => {
      result.current.onLoadMore();
    });

    rerender({ view: 'archived' });
    expect(result.current.rows.map((item) => item.id)).toEqual([1]);
    expect(result.current.hasNextPage).toBe(false);
    await act(async () => {
      olderPage.resolve({ items: [row(2)], appliedLimit: 1, totalEver: 2, degraded: false });
      archivedPage.resolve({ items: [row(9)], appliedLimit: 25, totalEver: 2, degraded: false });
    });

    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toEqual([9]));
  });

  it('never lets an older page read under the previous filters land in the new filters list', async () => {
    const olderPage = deferred<NotificationPage>();
    const listNotifications = vi.fn((request: { readonly view: string; readonly cursor: string }) => {
      if (request.view === 'archived') {
        return Promise.resolve({ items: [row(9)], appliedLimit: 25, totalEver: 2, degraded: false });
      }
      return request.cursor === '' ? Promise.resolve({ items: [row(1)], nextCursor: 'cursor-1', appliedLimit: 1, totalEver: 2, degraded: false }) : olderPage.promise;
    });
    const { rerender, result } = renderHook<ReturnType<typeof useNotificationCenterSync>, { view: 'active' | 'archived' }>(
      ({ view }) => useNotificationCenterSync({ source: makeSource(listNotifications), unreadOnly: false, view }),
      { initialProps: { view: 'active' }, wrapper: notificationsQueryWrapper().wrapper },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => {
      result.current.onLoadMore();
    });
    rerender({ view: 'archived' });
    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toEqual([9]));
    act(() => {
      result.current.applyReadState([9], true);
    });

    await act(async () => {
      olderPage.resolve({ items: [row(2)], appliedLimit: 1, totalEver: 2, degraded: false });
    });

    expect(result.current.rows.map((item) => item.id)).toEqual([9]);
    expect(result.current.rows[0]?.readAtMs).toBeDefined();
  });
});
