import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { Notification } from '../../../../../shared/contracts/notification.types';
import type { NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);

/**
 * Builds one master-list row.
 * @param id The record id, also used to make the title distinguishable.
 * @param title The row title to render.
 * @returns A `NotificationRow` fixture.
 */
function makeRow(id: number, title: string): NotificationRow {
  return { id, createdAtMs: id * 1000, title, body: '', level: 'info', source: 'download', actionCount: 0 };
}

/**
 * Builds a page from the given rows.
 * @param items The rows the page carries.
 * @returns A `NotificationPage` fixture with no further cursor.
 */
function makePage(items: readonly NotificationRow[]): NotificationPage {
  return { items, appliedLimit: 25, totalEver: items.length, degraded: false };
}

/** A controllable stand-in for the runtime push stream. */
function makePushSource(): { readonly source: NotificationSource; emit: (notification: Notification) => void } {
  const listeners: ((notification: Notification) => void)[] = [];

  return {
    emit(notification) {
      for (const listener of listeners) {
        listener(notification);
      }
    },
    source: {
      subscribe(listener) {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      },
      subscribeArchived() {
        return () => undefined;
      },
    },
  };
}

/** The push payload the backend emits alongside a freshly persisted record. */
const PUSHED: Notification = {
  Level: 'info',
  Title: 'Download run started',
  Body: '',
  Source: 'download',
  Timestamp: '2026-08-24T12:00:00Z',
  CorrelationID: 'run-9',
};

// Only the first test below is RED today. The duplicate guard and the
// unmount guard pass VACUOUSLY before the fix, because nothing subscribes yet
// and so nothing can duplicate or leak. They are written now because they are
// the two ways the obvious implementation goes wrong -- appending the pushed
// record blindly, and refreshing after unmount -- and both must be in place
// BEFORE that implementation exists. Do not read their current green as proof.
describe('NotificationCenterPanel live refresh (integration)', () => {
  it('shows a notification that arrives while the panel is open, without a remount', async () => {
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce(makePage([makeRow(1, 'Episode ready')]))
      .mockResolvedValue(makePage([makeRow(2, 'Download run started'), makeRow(1, 'Episode ready')]));
    const push = makePushSource();
    const source = { listNotifications, getNotification: vi.fn(), getUnreadCount: vi.fn(), markRead: vi.fn(), archive: vi.fn(), restore: vi.fn(), executeAction: vi.fn() } satisfies NotificationCenterSource;

    render(<NotificationCenterPanel pushSource={push.source} source={source} />);
    await waitFor(() => expect(screen.getByText('Episode ready')).toBeInTheDocument());

    act(() => push.emit(PUSHED));

    await waitFor(() => expect(screen.getByText('Download run started')).toBeInTheDocument());
    // The record that was already listed must survive the refresh.
    expect(screen.getByText('Episode ready')).toBeInTheDocument();
  });

  it('never renders the same record twice when a push races the fetch that already contains it', async () => {
    const page = makePage([makeRow(2, 'Download run started'), makeRow(1, 'Episode ready')]);
    const listNotifications = vi.fn().mockResolvedValue(page);
    const push = makePushSource();
    const source = { listNotifications, getNotification: vi.fn(), getUnreadCount: vi.fn(), markRead: vi.fn(), archive: vi.fn(), restore: vi.fn(), executeAction: vi.fn() } satisfies NotificationCenterSource;

    render(<NotificationCenterPanel pushSource={push.source} source={source} />);
    await waitFor(() => expect(screen.getByText('Download run started')).toBeInTheDocument());

    act(() => push.emit(PUSHED));
    act(() => push.emit(PUSHED));

    await waitFor(() => expect(screen.getAllByText('Download run started')).toHaveLength(1));
    expect(screen.getAllByText('Episode ready')).toHaveLength(1);
  });

  // NOTE: "a push must not collapse the pages the user already loaded" belongs
  // to `use-notification-center-sync.test.ts`, where `onLoadMore` can be driven
  // directly. Asserting it here would need the table's IntersectionObserver
  // sentinel, and a version that skipped that step would pass without ever
  // loading a second page -- a test that does not do what its name claims,
  // which is the exact defect this slice exists to correct.

  it('stops listening once unmounted, so a later push cannot update a dead panel', async () => {
    const listNotifications = vi.fn().mockResolvedValue(makePage([makeRow(1, 'Episode ready')]));
    const push = makePushSource();
    const source = { listNotifications, getNotification: vi.fn(), getUnreadCount: vi.fn(), markRead: vi.fn(), archive: vi.fn(), restore: vi.fn(), executeAction: vi.fn() } satisfies NotificationCenterSource;

    const view = render(<NotificationCenterPanel pushSource={push.source} source={source} />);
    await waitFor(() => expect(screen.getByText('Episode ready')).toBeInTheDocument());
    const callsWhileMounted = listNotifications.mock.calls.length;

    view.unmount();
    act(() => push.emit(PUSHED));

    expect(listNotifications).toHaveBeenCalledTimes(callsWhileMounted);
  });
});
