import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { type NotificationSelectionInput, useNotificationSelection } from '../use-notification-selection';
import { createCenterSource, notificationsQueryWrapper } from './notification-center.test-support';

/** Two fixture rows shared across every assertion below. */
const ROWS: readonly NotificationRow[] = [
  { id: 1, createdAtMs: 1000, title: 'A', body: '', level: 'info', source: 'download', actionCount: 0 },
  { id: 2, createdAtMs: 2000, title: 'B', body: '', level: 'info', source: 'download', actionCount: 0 },
];

/**
 * Renders the hook under a ready `notifications` module.
 * @param input The hook input.
 * @returns The `renderHook` result.
 */
function renderSelection(input: NotificationSelectionInput) {
  return renderHook(() => useNotificationSelection(input), { wrapper: notificationsQueryWrapper().wrapper });
}

describe('useNotificationSelection', () => {
  it('starts with an empty selection', () => {
    const { result } = renderSelection({ source: createCenterSource(), rows: ROWS, onMutated: vi.fn() });

    expect(result.current.selectedCount).toBe(0);
  });

  it('reports the selected count for a concrete key set', () => {
    const { result } = renderSelection({ source: createCenterSource(), rows: ROWS, onMutated: vi.fn() });

    act(() => {
      result.current.onSelectionChange(new Set([1, 2]));
    });

    expect(result.current.selectedCount).toBe(2);
  });

  it('resolves an "all" selection to every currently loaded row', () => {
    const { result } = renderSelection({ source: createCenterSource(), rows: ROWS, onMutated: vi.fn() });

    act(() => {
      result.current.onSelectionChange('all');
    });

    expect(result.current.selectedCount).toBe(ROWS.length);
  });

  it('onClearSelection resets the selection to empty', () => {
    const { result } = renderSelection({ source: createCenterSource(), rows: ROWS, onMutated: vi.fn() });

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
    const { result } = renderSelection({ source: createCenterSource({ markRead }), rows: ROWS, onMutated });

    act(() => {
      result.current.onSelectionChange(new Set([1]));
    });

    await act(async () => {
      result.current.onMarkRead();
    });

    expect(markRead).toHaveBeenCalledWith([1]);
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(result.current.selectedCount).toBe(0);
  });

  it('onArchive calls source.archive with the selected ids, then clears the selection and reports the mutation', async () => {
    const archive = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const { result } = renderSelection({ source: createCenterSource({ archive }), rows: ROWS, onMutated });

    act(() => {
      result.current.onSelectionChange(new Set([1, 2]));
    });

    await act(async () => {
      result.current.onArchive();
    });

    expect(archive).toHaveBeenCalledWith([1, 2]);
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(result.current.selectedCount).toBe(0);
  });

  it('onRestore calls source.restore with the selected ids, then clears the selection and reports the mutation', async () => {
    const restore = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    const onMutated = vi.fn();
    const { result } = renderSelection({ source: createCenterSource({ restore }), rows: ROWS, onMutated });

    act(() => {
      result.current.onSelectionChange(new Set([2]));
    });

    await act(async () => {
      result.current.onRestore();
    });

    expect(restore).toHaveBeenCalledWith([2]);
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(result.current.selectedCount).toBe(0);
  });

  it('onRestore is a no-op when nothing is selected', () => {
    const restore = vi.fn();
    const onMutated = vi.fn();
    const { result } = renderSelection({ source: createCenterSource({ restore }), rows: ROWS, onMutated });

    act(() => {
      result.current.onRestore();
    });

    expect(restore).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
  });

  it('onMarkRead is a no-op when nothing is selected', () => {
    const markRead = vi.fn();
    const onMutated = vi.fn();
    const { result } = renderSelection({ source: createCenterSource({ markRead }), rows: ROWS, onMutated });

    act(() => {
      result.current.onMarkRead();
    });

    expect(markRead).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
  });

  it('clears the selection and still reports the mutation when it fails, so the caller refetches what is true', async () => {
    const archive = vi.fn().mockRejectedValue(new Error('store closed'));
    const onMutated = vi.fn();
    const { result } = renderSelection({ source: createCenterSource({ archive }), rows: ROWS, onMutated });

    act(() => {
      result.current.onSelectionChange(new Set([1, 2]));
    });

    await act(async () => {
      result.current.onArchive();
    });

    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(archive).toHaveBeenCalledWith([1, 2]);
    expect(result.current.selectedCount).toBe(0);
  });
});
