import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import type { Notification } from '../../../../shared/contracts/notification.types';
import { NotificationsNavBadge } from '../NotificationsNavBadge';

afterEach(cleanup);

/** A fake source with only `getUnreadCount` wired; every other method is an unused stub. */
function makeCenterSource(unreadCount: number): NotificationCenterSource {
  return {
    listNotifications: vi.fn(),
    getNotification: vi.fn(),
    getUnreadCount: vi.fn().mockResolvedValue(unreadCount),
    markRead: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

/** A fake push source whose `push` helper lets a test emit a `notification.push` event on demand. */
function makePushSource(): { source: NotificationSource; push: (notification: Notification) => void } {
  const listeners = new Set<(notification: Notification) => void>();

  return {
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeArchived() {
        return () => undefined;
      },
    },
    push(notification) {
      for (const listener of listeners) {
        listener(notification);
      }
    },
  };
}

/** One fake push payload; its content is irrelevant, only its arrival increments the count. */
const FAKE_PUSH: Notification = {
  Title: 'Episode ready',
  Body: '',
  Level: 'info',
  Source: 'download',
  CorrelationID: '',
  Timestamp: '',
};

describe('NotificationsNavBadge', () => {
  it('shows a badge reflecting the unread count while it is greater than zero', async () => {
    render(<NotificationsNavBadge centerSource={makeCenterSource(3)} pushSource={makePushSource().source} />);

    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });

  it('shows no badge while the unread count is zero', async () => {
    const centerSource = makeCenterSource(0);

    const { container } = render(
      <NotificationsNavBadge centerSource={centerSource} pushSource={makePushSource().source} />,
    );

    await waitFor(() => expect(centerSource.getUnreadCount).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it('updates the badge count as soon as a notification.push event arrives, without a reload', async () => {
    const centerSource = makeCenterSource(0);
    const { source: pushSource, push } = makePushSource();

    render(<NotificationsNavBadge centerSource={centerSource} pushSource={pushSource} />);

    await waitFor(() => expect(centerSource.getUnreadCount).toHaveBeenCalledTimes(1));

    act(() => {
      push(FAKE_PUSH);
    });

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });
});
