import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationListRequest, NotificationPage } from '../../../../../shared/contracts/notification-center.types';
import { NOTIFICATION_FILTER_DEBOUNCE_MS } from '../../NotificationFilterBar/use-notification-filters';
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
});

/**
 * The debounced-search case drives the clock itself, so its fake-timer hooks
 * are scoped here: the three cases above need real timers, and a file-level
 * `beforeEach` would fake the clock under them too. `afterEach` is the
 * cleanup guarantee -- it uninstalls the fake clock even when an assertion
 * below throws, which the previous inline `vi.useRealTimers()` could not
 * promise.
 */
describe('NotificationCenterPanel debounced search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaches the "no results for the current filters" empty state once a typed search matches nothing (task 3b gap closure)', async () => {
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
    // The first page is a resolved promise, so it settles on microtasks, not on
    // a timer: one empty act step drains it and needs no wall-clock budget.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Episode ready')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'zzz' } });

    // The debounce is an explicit clock step, not a race: the keystroke only
    // schedules `useDebounce`, and the query that follows renders the panel
    // several times. Racing that against `vi.waitFor`'s one-second budget is
    // what failed under v8 instrumentation, where those renders cost more than
    // the budget allows.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_FILTER_DEBOUNCE_MS);
    });

    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'zzz' }));
  });
});
