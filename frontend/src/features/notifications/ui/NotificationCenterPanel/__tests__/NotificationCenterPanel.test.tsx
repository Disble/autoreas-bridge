import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationListRequest, NotificationPage } from '../../../../../shared/contracts/notification-center.types';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);

/** A fake source with only `listNotifications` wired; every other method is an unused stub. */
function makeSource(page: NotificationPage): NotificationCenterSource {
  return {
    listNotifications: vi.fn().mockResolvedValue(page),
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

describe('NotificationCenterPanel', () => {
  it('renders the fetched rows in the table', async () => {
    const source = makeSource({
      items: [{ id: 1, createdAtMs: 1000, title: 'Episode ready', body: '', level: 'info', source: 'download', actionCount: 0 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    });

    render(<NotificationCenterPanel source={source} />);

    await waitFor(() => expect(screen.getByText('Episode ready')).toBeInTheDocument());
  });

  it('renders the never-recorded empty state when nothing has ever been recorded', async () => {
    const source = makeSource({ items: [], appliedLimit: 25, totalEver: 0, degraded: false });

    render(<NotificationCenterPanel source={source} />);

    await waitFor(() => expect(screen.getByText('Nothing here yet')).toBeInTheDocument());
  });

  it('renders the unavailable empty state when the page comes back degraded', async () => {
    const source = makeSource({ items: [], appliedLimit: 25, totalEver: 0, degraded: true });

    render(<NotificationCenterPanel source={source} />);

    await waitFor(() => expect(screen.getByText('Notifications unavailable')).toBeInTheDocument());
  });

  it('reaches the "no results for the current filters" empty state once a typed search matches nothing (task 3b gap closure)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const listNotifications = vi.fn((request: NotificationListRequest): Promise<NotificationPage> =>
      Promise.resolve(
        request.search === 'zzz'
          ? { items: [], appliedLimit: 25, totalEver: 3, degraded: false }
          : {
              items: [{ id: 1, createdAtMs: 1000, title: 'Episode ready', body: '', level: 'info', source: 'download', actionCount: 0 }],
              appliedLimit: 25,
              totalEver: 3,
              degraded: false,
            },
      ),
    );
    const source: NotificationCenterSource = {
      listNotifications,
      getNotification: vi.fn(),
      getUnreadCount: vi.fn(),
      markRead: vi.fn(),
      markUnread: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
      executeAction: vi.fn(),
    };

    render(<NotificationCenterPanel source={source} />);
    await vi.waitFor(() => expect(screen.getByText('Episode ready')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'zzz' } });

    await vi.waitFor(() => expect(screen.getByText('No matches')).toBeInTheDocument());
    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'zzz' }));

    vi.useRealTimers();
  });
});
