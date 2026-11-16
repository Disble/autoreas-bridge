import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../shared/contracts/notification-center.types';
import type { ModuleReadiness } from '../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../shared/query/bridge-error/bridge-error.helpers';
import { connectBridgeEvents, createModulesTestWrapper } from '../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../shared/query/test-support/readiness-source.test-support';
import { NotificationsNavBadge } from '../NotificationsNavBadge';

afterEach(cleanup);

/** The notifications module, ready. */
const READY = status('notifications', 'ready');

/**
 * A fake source with only `getUnreadCount` wired; every other method is an unused stub.
 * @param getUnreadCount The unread-count read.
 * @returns The source.
 */
function makeCenterSource(getUnreadCount: NotificationCenterSource['getUnreadCount']): NotificationCenterSource {
  return {
    listNotifications: vi.fn(),
    getNotification: vi.fn(),
    getUnreadCount,
    markRead: vi.fn(),
    markUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

/**
 * Renders the badge with the notifications module in `readiness`.
 * @param centerSource The source the count is read through.
 * @param readiness The module's readiness.
 * @returns The render result plus the query client.
 */
function renderBadge(centerSource: NotificationCenterSource, readiness: ModuleReadiness = READY) {
  const { client, wrapper } = createModulesTestWrapper(readiness);
  return { client, ...render(<NotificationsNavBadge centerSource={centerSource} />, { wrapper }) };
}

describe('NotificationsNavBadge', () => {
  it('shows a badge reflecting the unread count while it is greater than zero', async () => {
    renderBadge(makeCenterSource(vi.fn().mockResolvedValue(3)));

    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('shows no badge while the unread count is zero', async () => {
    const getUnreadCount = vi.fn().mockResolvedValue(0);

    const { container } = renderBadge(makeCenterSource(getUnreadCount));

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows no badge and reads nothing while the notifications module is starting', async () => {
    const getUnreadCount = vi.fn().mockResolvedValue(3);

    const { container } = renderBadge(makeCenterSource(getUnreadCount), status('notifications', 'starting'));

    await act(async () => undefined);
    expect(getUnreadCount).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows no badge once the notifications module failed, rather than a count it never read', async () => {
    const getUnreadCount = vi.fn().mockResolvedValue(3);

    const { container } = renderBadge(makeCenterSource(getUnreadCount), status('notifications', 'failed', 'notifications: db closed'));

    await act(async () => undefined);
    expect(getUnreadCount).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows no badge when the count read fails', async () => {
    const getUnreadCount = vi.fn().mockRejectedValue(createBridgeError('internal', 'disk I/O error'));

    const { container } = renderBadge(makeCenterSource(getUnreadCount));

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['notification.push', 'notification.archived'])('reads the count again when %s arrives, without a reload', async (eventName) => {
    const getUnreadCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(2);
    const { client } = renderBadge(makeCenterSource(getUnreadCount));
    const events = connectBridgeEvents(client);
    expect(await screen.findByText('1')).toBeInTheDocument();

    act(() => {
      events.emit(eventName);
    });

    expect(await screen.findByText('2')).toBeInTheDocument();
    events.disconnect();
  });
});
