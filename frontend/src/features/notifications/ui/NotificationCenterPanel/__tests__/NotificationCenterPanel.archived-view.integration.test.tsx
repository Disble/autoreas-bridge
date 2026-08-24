import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationListRequest, NotificationPage } from '../../../../../shared/contracts/notification-center.types';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);

/** A push source that never emits: this seam is about views, not live inserts. */
const SILENT_PUSH: NotificationSource = {
  subscribe: () => () => undefined,
  subscribeArchived: () => () => undefined,
};

/** The one record living in the active view. */
const ACTIVE_PAGE: NotificationPage = {
  items: [{ id: 1, createdAtMs: 2000, title: 'Episode ready', body: '', level: 'info', source: 'download', actionCount: 0 }],
  appliedLimit: 25,
  totalEver: 2,
  degraded: false,
};

/** The one record living in the archived view. */
const ARCHIVED_PAGE: NotificationPage = {
  items: [{ id: 2, createdAtMs: 1000, title: 'Season available', body: '', level: 'info', source: 'season', actionCount: 0, archivedAtMs: 1500 }],
  appliedLimit: 25,
  totalEver: 2,
  degraded: false,
};

/**
 * Builds a source that answers each view with its own page, so a request
 * carrying the wrong view returns visibly wrong rows rather than passing by
 * accident.
 * @param overrides Methods to replace on the returned source.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return {
    listNotifications: vi.fn((request: NotificationListRequest) => Promise.resolve(request.view === 'archived' ? ARCHIVED_PAGE : ACTIVE_PAGE)),
    getNotification: vi.fn().mockResolvedValue({ found: false, item: null, degraded: false }),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false }),
    markUnread: vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false }),
    archive: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    restore: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    executeAction: vi.fn(),
    ...overrides,
  };
}

/**
 * Switches the panel to the archived view through whatever control exposes
 * it, and waits for the archived record to render.
 */
async function switchToArchived(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /archived/i }));
  await screen.findByText('Season available');
}

describe('NotificationCenterPanel archived view (integration)', () => {
  it('lists archived records once the user switches to the archived view', async () => {
    const source = makeSource();

    render(<NotificationCenterPanel pushSource={SILENT_PUSH} source={source} />);
    await screen.findByText('Episode ready');

    await switchToArchived();

    expect(source.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'archived' }));
    // The active record must be gone: switching views is not additive.
    expect(screen.queryByText('Episode ready')).not.toBeInTheDocument();
  });

  it('restores a selected record from the archived view', async () => {
    const restore = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    const source = makeSource({ restore });

    render(<NotificationCenterPanel pushSource={SILENT_PUSH} source={source} />);
    await screen.findByText('Episode ready');
    await switchToArchived();

    // Index 1: index 0 is the header's "select all".
    fireEvent.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith([2]));
  });

  it('offers Restore instead of Archive while the archived view is showing', async () => {
    render(<NotificationCenterPanel pushSource={SILENT_PUSH} source={makeSource()} />);
    await screen.findByText('Episode ready');
    await switchToArchived();

    fireEvent.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    // Archiving something already archived is not an action that means anything.
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('goes back to the active view, which is where archiving still applies', async () => {
    const source = makeSource();

    render(<NotificationCenterPanel pushSource={SILENT_PUSH} source={source} />);
    await screen.findByText('Episode ready');
    await switchToArchived();

    fireEvent.click(screen.getByRole('button', { name: /active/i }));

    await screen.findByText('Episode ready');
    expect(source.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'active' }));
    expect(screen.queryByText('Season available')).not.toBeInTheDocument();
  });

  it('reaches the archived-empty state when nothing has been archived', async () => {
    const source = makeSource({
      listNotifications: vi.fn((request: NotificationListRequest) =>
        Promise.resolve(request.view === 'archived' ? { items: [], appliedLimit: 25, totalEver: 1, degraded: false } : ACTIVE_PAGE),
      ),
    });

    render(<NotificationCenterPanel pushSource={SILENT_PUSH} source={source} />);
    await screen.findByText('Episode ready');

    fireEvent.click(screen.getByRole('button', { name: /archived/i }));

    // This empty state has existed since Slice 3a and has never been reachable.
    await waitFor(() => expect(screen.getByText('Nothing archived yet')).toBeInTheDocument());
  });
});
