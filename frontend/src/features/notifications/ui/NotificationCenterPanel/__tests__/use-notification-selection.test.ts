import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationSelection } from '../use-notification-selection';

/** Two fixture rows shared across every assertion below. */
const ROWS: readonly NotificationRow[] = [
  { id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 },
  { id: 2, createdAtMs: 2000, title: 'B', body: '', level: 'info', source: 'download', actionCount: 0 },
];

/** A fake source with only `markRead`/`archive` wired; every other method is an unused stub. */
function makeSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return {
    listNotifications: vi.fn(),
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    archive: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    restore: vi.fn(),
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
});
