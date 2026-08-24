import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import {
  getNotificationStoreState,
  resetNotificationStore,
  setUnreadNotificationCount,
} from '../../../../../shared/store/notification-store/notification-store.helpers';
import { useNotificationSelection } from '../use-notification-selection';

// The unread count is shared module state, so it outlives each test below.
beforeEach(resetNotificationStore);

/** Two fixture rows shared across every assertion below. */
const ROWS: readonly NotificationRow[] = [
  { id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 },
  { id: 2, createdAtMs: 2000, title: 'B', body: '', level: 'info', source: 'download', actionCount: 0 },
];

/** A fake source with only the three lifecycle mutations wired; every other method is an unused stub. */
function makeSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return {
    listNotifications: vi.fn(),
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    markUnread: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    archive: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    restore: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    executeAction: vi.fn(),
    ...overrides,
  };
}

describe('useNotificationSelection', () => {
  it('starts with an empty selection', () => {
    const { result } = renderHook(() => useNotificationSelection({ source: makeSource(), rows: ROWS, onMutated: vi.fn() }));

    expect(result.current.selectedCount).toBe(0);
  });

  it('reports the selected count for a concrete key set', () => {
    const { result } = renderHook(() => useNotificationSelection({ source: makeSource(), rows: ROWS, onMutated: vi.fn() }));

    act(() => {
      result.current.onSelectionChange(new Set([1, 2]));
    });

    expect(result.current.selectedCount).toBe(2);
  });

  it('resolves an "all" selection to every currently loaded row', () => {
    const { result } = renderHook(() => useNotificationSelection({ source: makeSource(), rows: ROWS, onMutated: vi.fn() }));

    act(() => {
      result.current.onSelectionChange('all');
    });

    expect(result.current.selectedCount).toBe(ROWS.length);
  });

  it('onClearSelection resets the selection to empty', () => {
    const { result } = renderHook(() => useNotificationSelection({ source: makeSource(), rows: ROWS, onMutated: vi.fn() }));

    act(() => {
      result.current.onSelectionChange(new Set([1]));
    });
    expect(result.current.selectedCount).toBe(1);

    act(() => {
      result.current.onClearSelection();
    });
    expect(result.current.selectedCount).toBe(0);
  });

  it('onMarkRead calls source.markRead with the selected ids, then clears the selection and reports the mutation', async () => {
    const markRead = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ markRead }), rows: ROWS, onMutated }),
    );

    act(() => {
      result.current.onSelectionChange(new Set([1]));
    });

    await act(async () => {
      result.current.onMarkRead();
    });

    expect(markRead).toHaveBeenCalledWith([1]);
    expect(result.current.selectedCount).toBe(0);
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('onArchive calls source.archive with the selected ids, then clears the selection and reports the mutation', async () => {
    const archive = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ archive }), rows: ROWS, onMutated }),
    );

    act(() => {
      result.current.onSelectionChange(new Set([1, 2]));
    });

    await act(async () => {
      result.current.onArchive();
    });

    expect(archive).toHaveBeenCalledWith([1, 2]);
    expect(result.current.selectedCount).toBe(0);
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('onRestore calls source.restore with the selected ids, then clears the selection and reports the mutation', async () => {
    const restore = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ restore }), rows: ROWS, onMutated }),
    );

    act(() => {
      result.current.onSelectionChange(new Set([2]));
    });

    await act(async () => {
      result.current.onRestore();
    });

    expect(restore).toHaveBeenCalledWith([2]);
    expect(result.current.selectedCount).toBe(0);
    expect(onMutated).toHaveBeenCalledTimes(1);
  });

  it('onRestore is a no-op when nothing is selected', () => {
    const restore = vi.fn();
    const onMutated = vi.fn();
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ restore }), rows: ROWS, onMutated }),
    );

    act(() => {
      result.current.onRestore();
    });

    expect(restore).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
  });

  it("feeds the restore's own fresh unread count into the shared store, so the badge follows records back into the inbox", async () => {
    // A restored record that was never read counts again, so the server's
    // number can move UP -- nothing about the selection size predicts it.
    setUnreadNotificationCount(1);
    const restore = vi.fn().mockResolvedValue({ affected: 2, unreadCount: 3, degraded: false });
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ restore }), rows: ROWS, onMutated: vi.fn() }),
    );

    act(() => {
      result.current.onSelectionChange('all');
    });
    await act(async () => {
      result.current.onRestore();
    });

    expect(getNotificationStoreState().unreadCount).toBe(3);
  });

  it('leaves the badge alone when a restore comes back degraded', async () => {
    setUnreadNotificationCount(5);
    const restore = vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: true });
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ restore }), rows: ROWS, onMutated: vi.fn() }),
    );

    act(() => {
      result.current.onSelectionChange(new Set([1]));
    });
    await act(async () => {
      result.current.onRestore();
    });

    expect(getNotificationStoreState().unreadCount).toBe(5);
  });

  it('onMarkRead is a no-op when nothing is selected', () => {
    const markRead = vi.fn();
    const onMutated = vi.fn();
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ markRead }), rows: ROWS, onMutated }),
    );

    act(() => {
      result.current.onMarkRead();
    });

    expect(markRead).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
  });

  it("feeds the mark-read's own fresh unread count into the shared store, so the rail badge falls with it", async () => {
    setUnreadNotificationCount(3);
    const markRead = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 2, degraded: false });
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ markRead }), rows: ROWS, onMutated: vi.fn() }),
    );

    act(() => {
      result.current.onSelectionChange(new Set([1]));
    });
    await act(async () => {
      result.current.onMarkRead();
    });

    expect(getNotificationStoreState().unreadCount).toBe(2);
  });

  it("feeds the archive's count in too, and takes it verbatim rather than deriving it from the selection", async () => {
    // Two rows are archived but the server reports four still unread:
    // `Store.Archive` marks unread records read as a side effect, so nothing
    // about the selection size predicts the new count.
    setUnreadNotificationCount(9);
    const archive = vi.fn().mockResolvedValue({ affected: 2, unreadCount: 4, degraded: false });
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ archive }), rows: ROWS, onMutated: vi.fn() }),
    );

    act(() => {
      result.current.onSelectionChange('all');
    });
    await act(async () => {
      result.current.onArchive();
    });

    expect(getNotificationStoreState().unreadCount).toBe(4);
  });

  it('leaves the badge alone when the mutation comes back degraded', async () => {
    setUnreadNotificationCount(3);
    const markRead = vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: true });
    const { result } = renderHook(() =>
      useNotificationSelection({ source: makeSource({ markRead }), rows: ROWS, onMutated: vi.fn() }),
    );

    act(() => {
      result.current.onSelectionChange(new Set([1]));
    });
    await act(async () => {
      result.current.onMarkRead();
    });

    expect(getNotificationStoreState().unreadCount).toBe(3);
  });
});
