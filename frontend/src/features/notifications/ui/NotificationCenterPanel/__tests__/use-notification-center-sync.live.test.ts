import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { Notification } from '../../../../../shared/contracts/notification.types';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationCenterSync } from '../use-notification-center-sync';

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

/** A controllable stand-in for the `notification.push` and `notification.archived` runtime streams. */
function makePushSource(): {
  readonly source: NotificationSource;
  emit: () => void;
  emitArchived: (recordIds: readonly number[]) => void;
} {
  const listeners: ((notification: Notification) => void)[] = [];
  const archivedListeners: ((recordIds: readonly number[]) => void)[] = [];

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
    emitArchived(recordIds) {
      for (const listener of archivedListeners) {
        listener(recordIds);
      }
    },
    source: {
      subscribe(listener) {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      },
      subscribeArchived(listener) {
        archivedListeners.push(listener);
        return () => {
          archivedListeners.splice(archivedListeners.indexOf(listener), 1);
        };
      },
      subscribeNavigate() {
        return () => undefined;
      },
    },
  };
}


/**
 * The half of `useNotificationCenterSync` that reacts to something other than
 * the user: a `notification.push` arriving, a record archived from anywhere,
 * and a read state committed by the detail pane. Its sibling file covers the
 * keyset pagination underneath.
 */
describe('useNotificationCenterSync (live updates)', () => {
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

  it('drops an archived record from the active list without rewinding the pages already loaded', async () => {
    // The archive verb lives in the detail pane and in the selection bar, and
    // neither re-mounts the list. Without this the record stayed on the active
    // list until a remount, even though the store had already archived it.
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({ items: [makeRow(3), makeRow(2)], nextCursor: 'cursor-1', appliedLimit: 2, totalEver: 3, degraded: false })
      .mockResolvedValueOnce({ items: [makeRow(1)], appliedLimit: 2, totalEver: 3, degraded: false });
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
      push.emitArchived([2]);
    });

    // Page two's row survives: dropping the archived id in place is what keeps
    // a user who paged three times where they were.
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([3, 1]));
    expect(listNotifications).toHaveBeenCalledTimes(2);
  });

  it('drops every id the archived event names, and leaves the list alone when it names none of them', async () => {
    const listNotifications = vi
      .fn()
      .mockResolvedValue({ items: [makeRow(3), makeRow(2), makeRow(1)], appliedLimit: 25, totalEver: 3, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);
    const { result } = renderHook(() =>
      useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: false, view: 'active' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      push.emitArchived([99]);
    });
    expect(result.current.rows.map((row) => row.id)).toEqual([3, 2, 1]);

    act(() => {
      push.emitArchived([3, 1]);
    });
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([2]));
  });

  it('brings a newly archived record into the archived view instead of dropping it', async () => {
    // Same event, opposite meaning: in the archive the record has just
    // ARRIVED. Filtering it out here would hide the very row the user is
    // looking at the archive to find.
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({ items: [makeRow(1)], appliedLimit: 25, totalEver: 2, degraded: false })
      .mockResolvedValue({ items: [makeRow(5), makeRow(1)], appliedLimit: 25, totalEver: 2, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);
    const { result } = renderHook(() =>
      useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: false, view: 'archived' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      push.emitArchived([5]);
    });

    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([5, 1]));
    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '', view: 'archived' }));
  });

  it('follows the view the user switched to, not the one mounted with, when an archived event arrives', async () => {
    // The panel does not re-mount when the tabs change, so the archived
    // handler and its subscription both have to follow `view`. Pinned to the
    // mount-time value they keep filtering after the user has crossed into the
    // archive -- which silently deletes the arriving row instead of showing it.
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({ items: [makeRow(2), makeRow(1)], appliedLimit: 25, totalEver: 3, degraded: false })
      .mockResolvedValueOnce({ items: [makeRow(9)], appliedLimit: 25, totalEver: 3, degraded: false })
      .mockResolvedValue({ items: [makeRow(7), makeRow(9)], appliedLimit: 25, totalEver: 3, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);

    const { rerender, result } = renderHook<ReturnType<typeof useNotificationCenterSync>, { view: 'active' | 'archived' }>(
      ({ view }) => useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: false, view }),
      { initialProps: { view: 'active' } },
    );

    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([2, 1]));

    rerender({ view: 'archived' });
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([9]));

    act(() => {
      push.emitArchived([7]);
    });

    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([7, 9]));
    expect(listNotifications).toHaveBeenCalledTimes(3);
  });

  it('stamps a record read in place, so its unread dot clears without re-fetching a page', async () => {
    // Opening a record marks it read, and the master list has to show that.
    // A re-fetch would rewind the user's paging for a dot; the id and the new
    // state are all the list needs to answer it itself.
    const listNotifications = vi
      .fn()
      .mockResolvedValue({ items: [makeRow(2), makeRow(1)], appliedLimit: 25, totalEver: 2, degraded: false });
    const source = makeSource(listNotifications);
    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows.map((row) => row.readAtMs)).toEqual([undefined, undefined]);

    act(() => {
      result.current.applyReadState([2], true);
    });

    expect(result.current.rows[0].readAtMs).toBeGreaterThan(0);
    expect(result.current.rows[1].readAtMs).toBeUndefined();
    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it('clears the read stamp when a record is put back to unread', async () => {
    const listNotifications = vi.fn().mockResolvedValue({
      items: [{ ...makeRow(2), readAtMs: 1_700_000_500_000 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    });
    const source = makeSource(listNotifications);
    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.applyReadState([2], false);
    });

    expect(result.current.rows[0].readAtMs).toBeUndefined();
    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it('leaves the loaded rows untouched when the read state names nothing on screen', async () => {
    const listNotifications = vi.fn().mockResolvedValue({ items: [makeRow(1)], appliedLimit: 25, totalEver: 1, degraded: false });
    const source = makeSource(listNotifications);
    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = result.current.rows;

    act(() => {
      result.current.applyReadState([404], true);
    });

    // Same array identity: an update that changes nothing must not re-render
    // the table, and must certainly not invent a row for an id it never had.
    expect(result.current.rows).toBe(before);
  });

  it('leaves the rows untouched when the state asked for is the one they already carry', async () => {
    // Marking an already-unread record unread is idempotent -- the pane's own
    // mark-unread button says so -- so it must not rebuild every row object
    // and re-render the table to land on the state already showing.
    const listNotifications = vi.fn().mockResolvedValue({ items: [makeRow(1)], appliedLimit: 25, totalEver: 1, degraded: false });
    const source = makeSource(listNotifications);
    const { result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = result.current.rows;

    act(() => {
      result.current.applyReadState([1], false);
    });

    expect(result.current.rows).toBe(before);
  });

  it('keeps applyReadState stable across renders, so the callbacks built on it do not churn', async () => {
    const listNotifications = vi.fn().mockResolvedValue({ items: [makeRow(1)], appliedLimit: 25, totalEver: 1, degraded: false });
    const source = makeSource(listNotifications);
    const { rerender, result } = renderHook(() => useNotificationCenterSync({ source, unreadOnly: false, view: 'active' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = result.current.applyReadState;

    rerender();

    // It is a dependency of the open-record callback the pane presses, so a
    // fresh identity every render would rebuild that chain for nothing.
    expect(result.current.applyReadState).toBe(first);
  });

  it('stops listening for archived records once unmounted', async () => {
    const listNotifications = vi.fn().mockResolvedValue({ items: [makeRow(1)], appliedLimit: 25, totalEver: 1, degraded: false });
    const push = makePushSource();
    const source = makeSource(listNotifications);
    const { result, unmount } = renderHook(() =>
      useNotificationCenterSync({ source, pushSource: push.source, unreadOnly: false, view: 'active' }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    unmount();

    act(() => {
      push.emitArchived([1]);
    });

    expect(listNotifications).toHaveBeenCalledTimes(1);
  });
});
