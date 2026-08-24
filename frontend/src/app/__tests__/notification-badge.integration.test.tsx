import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsNavBadge } from '../../features/navigation/NotificationsNavBadge/NotificationsNavBadge';
import type { NotificationPage } from '../../shared/contracts/notification-center.types';
import type { NotificationCenterPanelProps } from '../../features/notifications/ui/NotificationCenterPanel/notification-center-panel.types';
import { NotificationCenterPanel } from '../../features/notifications/ui/NotificationCenterPanel/NotificationCenterPanel';

afterEach(cleanup);

/**
 * The shape this test injects, derived from the panel's own prop rather than
 * imported from `infrastructure/`. The app layer must not reach into
 * infrastructure — fallow's `boundary-violation` rule blocks it, and that
 * applies to a test as much as to production code. Reading the type back off
 * the component that consumes it is both allowed (app may import features)
 * and stricter: if the prop's type changes, this test stops compiling.
 */
type NotificationCenterSourceDouble = NonNullable<NotificationCenterPanelProps['source']>;

/** Two unread records, so a single mark-read leaves a non-zero count behind. */
const PAGE: NotificationPage = {
  items: [
    { id: 1, createdAtMs: 2000, title: 'Episode ready', body: '', level: 'info', source: 'download', actionCount: 0 },
    { id: 2, createdAtMs: 1000, title: 'Season available', body: '', level: 'info', source: 'season', actionCount: 0 },
  ],
  appliedLimit: 25,
  totalEver: 2,
  degraded: false,
};

/** A push source that never emits; the badge subscribes to it but this seam is about mutations. */
const SILENT_PUSH = {
  subscribe: () => () => undefined,
  subscribeArchived: () => () => undefined,
};

/**
 * Renders the rail badge beside the panel over one shared source, which is
 * what `AppLayout` does: the badge lives in the rail, the panel in the route,
 * and the only thing joining them is that they read the same data.
 * @param source The shared notification-center source.
 * @returns The rendered result.
 */
function renderRailAndPanel(source: NotificationCenterSourceDouble) {
  return render(
    <>
      <NotificationsNavBadge centerSource={source} pushSource={SILENT_PUSH} />
      <NotificationCenterPanel pushSource={SILENT_PUSH} source={source} />
    </>,
  );
}

/**
 * Selects the first listed record through its row checkbox. Index 1 because
 * index 0 is the header's "select all" -- the same convention
 * `NotificationTable.test.tsx` already relies on. Waits for the rows to render
 * first, so a failure here is a real selection failure and not a race.
 */
async function selectFirstRow(): Promise<void> {
  await screen.findByText('Episode ready');
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes).toHaveLength(3);
  fireEvent.click(checkboxes[1] as HTMLElement);
}

describe('unread badge vs. the master list (integration)', () => {
  it('drops the badge count when a record is marked read from the selection bar', async () => {
    const markRead = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 1, degraded: false });
    const source: NotificationCenterSourceDouble = {
      listNotifications: vi.fn().mockResolvedValue(PAGE),
      getNotification: vi.fn(),
      getUnreadCount: vi.fn().mockResolvedValue(2),
      markRead,
      markUnread: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
      executeAction: vi.fn(),
    };

    renderRailAndPanel(source);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());

    await selectFirstRow();
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    expect(markRead).toHaveBeenCalledWith([1]);
  });

  it('removes the badge entirely once nothing is unread, rather than showing a zero', async () => {
    const source: NotificationCenterSourceDouble = {
      listNotifications: vi.fn().mockResolvedValue(PAGE),
      getNotification: vi.fn(),
      getUnreadCount: vi.fn().mockResolvedValue(1),
      markRead: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
      markUnread: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
      archive: vi.fn(),
      restore: vi.fn(),
      executeAction: vi.fn(),
    };

    renderRailAndPanel(source);
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());

    await selectFirstRow();
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('drops the badge count when records are archived, because archiving reads them too', async () => {
    // `Store.Archive` runs a second update carrying `WHERE read_at_ms IS NULL`,
    // so archiving an unread record marks it read as a side effect. The badge
    // therefore cannot derive its count from the selection size and must take
    // the server's own `unreadCount`.
    const source: NotificationCenterSourceDouble = {
      listNotifications: vi.fn().mockResolvedValue(PAGE),
      getNotification: vi.fn(),
      getUnreadCount: vi.fn().mockResolvedValue(2),
      markRead: vi.fn(),
      markUnread: vi.fn(),
      archive: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 1, degraded: false }),
      restore: vi.fn(),
      executeAction: vi.fn(),
    };

    renderRailAndPanel(source);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());

    await selectFirstRow();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });
});
