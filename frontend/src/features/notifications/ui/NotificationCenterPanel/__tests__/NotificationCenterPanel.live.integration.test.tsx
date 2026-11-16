import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { NotificationCenterPanel } from '../NotificationCenterPanel';
import { createCenterSource, notificationsQueryWrapper } from './notification-center.test-support';

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

describe('NotificationCenterPanel live refresh (integration)', () => {
  it('shows a notification that arrives while the panel is open, without a remount', async () => {
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce(makePage([makeRow(1, 'Episode ready')]))
      .mockResolvedValue(makePage([makeRow(2, 'Download run started'), makeRow(1, 'Episode ready')]));
    const query = notificationsQueryWrapper();
    const source = createCenterSource({ listNotifications });

    render(<NotificationCenterPanel source={source} />, { wrapper: query.wrapper });
    await waitFor(() => expect(screen.getByText('Episode ready')).toBeInTheDocument());

    act(() => query.emitEvent('notification.push'));

    await waitFor(() => expect(screen.getByText('Download run started')).toBeInTheDocument());
    // The record that was already listed must survive the refresh.
    expect(screen.getByText('Episode ready')).toBeInTheDocument();
  });

  it('never renders the same record twice when a push races the fetch that already contains it', async () => {
    const page = makePage([makeRow(2, 'Download run started'), makeRow(1, 'Episode ready')]);
    const listNotifications = vi.fn().mockResolvedValue(page);
    const query = notificationsQueryWrapper();
    const source = createCenterSource({ listNotifications });

    render(<NotificationCenterPanel source={source} />, { wrapper: query.wrapper });
    await waitFor(() => expect(screen.getByText('Download run started')).toBeInTheDocument());

    act(() => query.emitEvent('notification.push'));
    act(() => query.emitEvent('notification.push'));

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
    const query = notificationsQueryWrapper();
    const source = createCenterSource({ listNotifications });

    const view = render(<NotificationCenterPanel source={source} />, { wrapper: query.wrapper });
    await waitFor(() => expect(screen.getByText('Episode ready')).toBeInTheDocument());
    const callsWhileMounted = listNotifications.mock.calls.length;

    view.unmount();
    act(() => query.emitEvent('notification.push'));

    expect(listNotifications).toHaveBeenCalledTimes(callsWhileMounted);
  });
});
