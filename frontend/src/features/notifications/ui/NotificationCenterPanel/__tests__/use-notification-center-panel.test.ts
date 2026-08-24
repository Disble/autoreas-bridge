import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationListRequest, NotificationPage } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationCenterPanel } from '../use-notification-center-panel';

/** A push source that never emits: these assertions are about view state, not live inserts. */
const SILENT_PUSH: NotificationSource = {
  subscribe: () => () => undefined,
  subscribeArchived: () => () => undefined,
};

/** The active view's page, whose single row is what gets selected below. */
const ACTIVE_PAGE: NotificationPage = {
  items: [{ id: 7, createdAtMs: 2000, title: 'Episode ready', body: '', level: 'info', source: 'download', actionCount: 0 }],
  appliedLimit: 25,
  totalEver: 2,
  degraded: false,
};

/** The archived view's page, deliberately holding a different record id. */
const ARCHIVED_PAGE: NotificationPage = {
  items: [{ id: 9, createdAtMs: 1000, title: 'Season available', body: '', level: 'info', source: 'season', actionCount: 0, archivedAtMs: 1500 }],
  appliedLimit: 25,
  totalEver: 2,
  degraded: false,
};

/**
 * Builds a source answering each view with its own page.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(): NotificationCenterSource {
  return {
    listNotifications: vi.fn((request: NotificationListRequest) => Promise.resolve(request.view === 'archived' ? ARCHIVED_PAGE : ACTIVE_PAGE)),
    getNotification: vi.fn().mockResolvedValue({ found: false, item: null, degraded: false }),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markRead: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

describe('useNotificationCenterPanel', () => {
  it('opens on the active view', async () => {
    const { result } = renderHook(() => useNotificationCenterPanel(makeSource(), SILENT_PUSH));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.view).toBe('active');
  });

  it('drops the selection when the view changes, so a row picked for archiving is not carried into restore', async () => {
    const { result } = renderHook(() => useNotificationCenterPanel(makeSource(), SILENT_PUSH));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => {
      result.current.onSelectionChange(new Set([7]));
    });
    expect(result.current.selectedCount).toBe(1);

    act(() => {
      result.current.onViewChange('archived');
    });

    expect(result.current.view).toBe('archived');
    expect(result.current.selectedKeys).toEqual(new Set());
    await waitFor(() => expect(result.current.rows[0]?.id).toBe(9));
    expect(result.current.selectedCount).toBe(0);
  });

  it('reports the archived view to the empty-state conditions, which is what makes that rendering reachable', async () => {
    const { result } = renderHook(() => useNotificationCenterPanel(makeSource(), SILENT_PUSH));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => {
      result.current.onViewChange('archived');
    });

    await waitFor(() => expect(result.current.emptyStateConditions.view).toBe('archived'));
  });
});
