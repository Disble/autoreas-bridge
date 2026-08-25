import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationListRequest, NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import {
  resetNotificationStore,
  setUnreadNotificationCount,
} from '../../../../../shared/store/notification-store/notification-store.helpers';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);
beforeEach(resetNotificationStore);

/** A push source that never emits: this seam is about the screen chrome, not live inserts. */
const SILENT_PUSH: NotificationSource = {
  subscribe: () => () => undefined,
  subscribeArchived: () => () => undefined,
  subscribeNavigate: () => () => undefined,
};

/** The whole store, which the fake source below filters exactly as the SQL does. */
const ALL_ROWS: readonly NotificationRow[] = [
  { id: 1, createdAtMs: 3000, title: 'Download stopped', body: '', level: 'warning', source: 'download', actionCount: 0 },
  { id: 2, createdAtMs: 2000, title: 'Device sync needs attention', body: '', level: 'info', source: 'device', actionCount: 0, readAtMs: 2500 },
  { id: 3, createdAtMs: 1000, title: 'Season available', body: '', level: 'info', source: 'season', actionCount: 0, archivedAtMs: 1500 },
];

/**
 * Answers one list request the way `buildListQuery` does, so a request that
 * asks the wrong question returns visibly wrong rows instead of passing by
 * accident. An empty `levels`/`sources` array applies no filter at all --
 * the exact contract the Go store pins.
 * @param request The query the panel issued.
 * @returns The page that query selects.
 */
function pageFor(request: NotificationListRequest): NotificationPage {
  const inView = ALL_ROWS.filter((row) => (request.view === 'archived' ? row.archivedAtMs !== undefined : row.archivedAtMs === undefined));
  const byRead = request.unreadOnly ? inView.filter((row) => (row.readAtMs ?? 0) === 0) : inView;
  const byLevel = request.levels.length === 0 ? byRead : byRead.filter((row) => request.levels.includes(row.level));
  const bySource = request.sources.length === 0 ? byLevel : byLevel.filter((row) => request.sources.includes(row.source));
  return { items: bySource, appliedLimit: 25, totalEver: ALL_ROWS.length, degraded: false };
}

/**
 * Builds a source over `pageFor`.
 * @param overrides Methods to replace on the returned source.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return {
    listNotifications: vi.fn((request: NotificationListRequest) => Promise.resolve(pageFor(request))),
    getNotification: vi.fn().mockResolvedValue({ found: false, item: null, degraded: false }),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    markUnread: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    archive: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    restore: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    executeAction: vi.fn(),
    ...overrides,
  };
}

/**
 * Renders the panel and waits for the first page to land.
 * @param source The source double to read through.
 * @returns Nothing; resolves once the inbox is on screen.
 */
async function renderPanel(source: NotificationCenterSource): Promise<void> {
  render(<NotificationCenterPanel pushSource={SILENT_PUSH} source={source} />);
  await screen.findByText('Download stopped');
}

describe('NotificationCenterPanel view tabs (integration)', () => {
  it('narrows the query to unread records on the Unread tab', async () => {
    const source = makeSource();
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

    await waitFor(() => expect(screen.queryByText('Device sync needs attention')).not.toBeInTheDocument());
    expect(source.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ unreadOnly: true, view: 'active' }));
    expect(screen.getByText('Download stopped')).toBeInTheDocument();
  });

  it('reaches the "All caught up" empty state, which has never been reachable before', async () => {
    const source = makeSource({
      listNotifications: vi.fn((request: NotificationListRequest) =>
        Promise.resolve(request.unreadOnly ? { items: [], appliedLimit: 25, totalEver: 3, degraded: false } : pageFor(request)),
      ),
    });
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

    await waitFor(() => expect(screen.getByText('All caught up')).toBeInTheDocument());
  });

  it('shows only the records already read on the Read tab, which the store cannot express as a query', async () => {
    const source = makeSource();
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    await waitFor(() => expect(screen.queryByText('Download stopped')).not.toBeInTheDocument());
    expect(screen.getByText('Device sync needs attention')).toBeInTheDocument();
    expect(source.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ unreadOnly: false, view: 'active' }));
  });

  it('drops the selection when the view changes, so a row picked under one tab is not carried into another', async () => {
    await renderPanel(makeSource());

    // Index 1: index 0 is the header's "select all".
    fireEvent.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
  });
});

describe('NotificationCenterPanel level and source filters (integration)', () => {
  it('sends the picked level to the backend and narrows the list to it', async () => {
    const source = makeSource();
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: /filter by level/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Warning' }));

    await waitFor(() => expect(screen.queryByText('Device sync needs attention')).not.toBeInTheDocument());
    expect(source.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ levels: ['warning'] }));
    expect(screen.getByText('Download stopped')).toBeInTheDocument();
  });

  it('sends an empty level array once the filter is cleared, which means everything and not nothing', async () => {
    const source = makeSource();
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: /filter by level/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Warning' }));
    await waitFor(() => expect(screen.queryByText('Device sync needs attention')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('option', { name: 'Warning' }));

    await waitFor(() => expect(screen.getByText('Device sync needs attention')).toBeInTheDocument());
    expect(source.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ levels: [] }));
  });

  it('calls an empty level filter "no matches", never "all archived"', async () => {
    // The two empty states say opposite things: "All archived" tells the user
    // to go look in the archive, which is wrong when the inbox is only hidden
    // behind a filter they applied one press ago.
    await renderPanel(makeSource());

    fireEvent.click(screen.getByRole('button', { name: /filter by level/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Error' }));

    await waitFor(() => expect(screen.getByText('No matches')).toBeInTheDocument());
    expect(screen.queryByText('All archived')).not.toBeInTheDocument();
  });

  it('calls an empty source filter "no matches" too, on its own', async () => {
    const source = makeSource({
      listNotifications: vi.fn((request: NotificationListRequest) =>
        Promise.resolve(request.sources.length > 0 ? { items: [], appliedLimit: 25, totalEver: 3, degraded: false } : pageFor(request)),
      ),
    });
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: /filter by source/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Device' }));

    await waitFor(() => expect(screen.getByText('No matches')).toBeInTheDocument());
    expect(screen.queryByText('All archived')).not.toBeInTheDocument();
  });

  it('offers exactly the sources the loaded records carry, never a hardcoded list', async () => {
    await renderPanel(makeSource());

    fireEvent.click(screen.getByRole('button', { name: /filter by source/i }));

    expect(screen.getByRole('option', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Device' })).toBeInTheDocument();
    // "season" only ever appears in the archive, which the active view never loaded.
    expect(screen.queryByRole('option', { name: 'Season' })).not.toBeInTheDocument();
  });

  it('sends the picked source to the backend', async () => {
    const source = makeSource();
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: /filter by source/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Device' }));

    await waitFor(() => expect(source.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ sources: ['device'] })));
  });
});

describe('NotificationCenterPanel header (integration)', () => {
  it('renders the page heading, which the route no longer owns', async () => {
    await renderPanel(makeSource());

    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
  });

  it('carries the shared store live unread count in the subtitle', async () => {
    await renderPanel(makeSource());

    setUnreadNotificationCount(12);

    await waitFor(() =>
      expect(screen.getByText('12 unread · Warnings and failures stay here after the toast disappears.')).toBeInTheDocument(),
    );
  });

  it('never claims the list is sorted unread first, because the store sorts by creation time alone', async () => {
    await renderPanel(makeSource());

    expect(screen.queryByText(/unread first/i)).not.toBeInTheDocument();
  });

  it('marks every loaded unread record read from the header, and lowers the badge with it', async () => {
    const markRead = vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false });
    setUnreadNotificationCount(1);
    await renderPanel(makeSource({ markRead }));

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith([1]));
    await waitFor(() =>
      expect(screen.getByText('No unread · Warnings and failures stay here after the toast disappears.')).toBeInTheDocument(),
    );
  });

  it('offers nothing to mark once every loaded record is already read', async () => {
    const source = makeSource();
    await renderPanel(source);

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await waitFor(() => expect(screen.queryByText('Download stopped')).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });
});
