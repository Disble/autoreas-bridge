import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  NotificationCenterSource,
  NotificationDetail,
  NotificationDetailResult,
} from '../../../../../shared/contracts/notification-center.types';
import { useNotificationOpenRecord } from '../use-notification-open-record';
import { createCenterSource, notificationsQueryWrapper } from './notification-center.test-support';

/** Builds the record a `getNotification` read resolves to, defaulting to id 7. */
function buildRecord(id = 7): NotificationDetail {
  return {
    id,
    createdAtMs: 1000,
    title: `Record ${id}`,
    body: '',
    level: 'info',
    source: 'download',
    actionCount: 0,
    rows: [],
    actions: [],
  };
}

/**
 * A fake source whose `getNotification` finds record 7 and whose `markRead` commits.
 * @param overrides The methods a case cares about.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return createCenterSource({
    getNotification: vi.fn().mockResolvedValue({ found: true, item: buildRecord(), degraded: false }),
    markRead: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    ...overrides,
  });
}

describe('useNotificationOpenRecord', () => {
  it('has no record open before anything is pressed', () => {
    const { result } = renderHook(() => useNotificationOpenRecord({ source: makeSource() }), { wrapper: notificationsQueryWrapper().wrapper });

    expect(result.current.openRecord).toBeNull();
  });

  it('clears the pane when the opened record is not found', async () => {
    const source = makeSource({ getNotification: vi.fn().mockResolvedValue({ found: false, item: buildRecord(), degraded: true }) });
    const { result } = renderHook(() => useNotificationOpenRecord({ source }), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.onOpenRecord(7);
    });

    await waitFor(() => expect(source.getNotification).toHaveBeenCalledWith(7));
    expect(result.current.openRecord).toBeNull();
  });

  it('marks the record read on the press itself, even when its read comes back not found', async () => {
    const markRead = vi.fn().mockRejectedValue(new Error('store closed'));
    const source = makeSource({
      getNotification: vi.fn().mockResolvedValue({ found: false, item: buildRecord(), degraded: true }),
      markRead,
    });
    const { result } = renderHook(() => useNotificationOpenRecord({ source }), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.onOpenRecord(7);
    });

    await waitFor(() => expect(markRead).toHaveBeenCalledWith([7]));
  });

  it('keeps the record pressed last when an earlier read resolves after it', async () => {
    // Deliberately resolves out of order: id 1's read settles AFTER id 2's,
    // which is exactly the interleaving that would otherwise leave the pane
    // showing a record the user already navigated away from.
    const pending = new Map<number, (result: NotificationDetailResult) => void>();
    const getNotification = vi.fn(
      (id: number) =>
        new Promise<NotificationDetailResult>((resolve) => {
          pending.set(id, resolve);
        }),
    );
    const { result } = renderHook(() => useNotificationOpenRecord({ source: makeSource({ getNotification }) }), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.onOpenRecord(1);
      result.current.onOpenRecord(2);
    });

    await waitFor(() => expect(getNotification).toHaveBeenCalledWith(2));
    await act(async () => {
      pending.get(2)?.({ found: true, item: buildRecord(2), degraded: false });
      pending.get(1)?.({ found: true, item: buildRecord(1), degraded: false });
    });

    await waitFor(() => expect(result.current.openRecord?.id).toBe(2));
  });

  // The rail badge fell on open from the first version of this hook, but the
  // master-list row it was standing on kept its unread dot until a remount.
  it('reports the record it just marked read, so the master-list row can drop its unread dot', async () => {
    const onReadStateChanged = vi.fn();
    const { result } = renderHook(() => useNotificationOpenRecord({ source: makeSource(), onReadStateChanged }), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.onOpenRecord(7);
    });

    await waitFor(() => expect(onReadStateChanged).toHaveBeenCalledWith([7], true));
  });

  // Same shape as the mark-unread hook's own currently-open-record test: this
  // hook keeps its instance while the panel re-renders around it, so a
  // callback pinned to the first render would report to a listener the panel
  // has already replaced.
  it('reports to the callback it currently has, not the one it first rendered with', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const source = makeSource();
    const { rerender, result } = renderHook(
      ({ onReadStateChanged }: { onReadStateChanged: (recordIds: readonly number[], isRead: boolean) => void }) =>
        useNotificationOpenRecord({ source, onReadStateChanged }),
      { initialProps: { onReadStateChanged: first }, wrapper: notificationsQueryWrapper().wrapper },
    );

    rerender({ onReadStateChanged: second });
    act(() => {
      result.current.onOpenRecord(7);
    });

    await waitFor(() => expect(second).toHaveBeenCalledWith([7], true));
    expect(first).not.toHaveBeenCalled();
  });

  it('reports nothing when the mark-read failed, rather than clearing a dot the store still stands behind', async () => {
    const markRead = vi.fn().mockRejectedValue(new Error('store closed'));
    const onReadStateChanged = vi.fn();
    const { result } = renderHook(() => useNotificationOpenRecord({ source: makeSource({ markRead }), onReadStateChanged }), { wrapper: notificationsQueryWrapper().wrapper });

    act(() => {
      result.current.onOpenRecord(7);
    });

    await waitFor(() => expect(markRead).toHaveBeenCalledWith([7]));
    expect(onReadStateChanged).not.toHaveBeenCalled();
  });
});
